import { Hono } from 'hono'
import type { Context } from 'hono'
import { db } from '@railcode/sdk'
import { LOGO_HOST, UA, egressAllowed } from './net'
import * as yc from './yc'
import * as custom from './custom'
import { WORKFLOWS } from './workflows'
import {
  addBookmarks,
  createList,
  deleteList,
  listItems,
  listLists,
  membership,
  removeBookmarks,
  renameList,
  type BookmarkTarget,
} from './bookmarks'
import {
  collectionItems,
  createRun,
  deleteCollection,
  deleteRun,
  getRun,
  listRuns,
  setStatus,
  shapeRow,
  step,
  type Item,
} from './runs'
import { clearIndex, indexStatus, readCatalog, rebuildIndex } from './lookup'

// The worker is the app's only way off the origin, and the only place that may
// spend money. Routes stay thin: sources live in yc.ts, extraction in
// workflows.ts, and the run loop in runs.ts.

const app = new Hono()

/** Errors reach the client as a message, never a stack. */
function fail(c: Context, err: unknown, status: 400 | 404 | 502) {
  return c.json({ error: err instanceof Error ? err.message : 'request failed' }, status)
}

// ── source: Y Combinator ─────────────────────────────────────────────────────

app.post('/api/search', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as yc.SearchBody
  try {
    return c.json(await yc.search(body))
  } catch (err) {
    return fail(c, err, 502)
  }
})

app.get('/api/company/:slug', async (c) => {
  try {
    const hit = await yc.bySlug(c.req.param('slug').slice(0, 120))
    if (!hit) return c.json({ error: 'not found' }, 404)
    return c.json(hit)
  } catch (err) {
    return fail(c, err, 502)
  }
})

/**
 * Logos live on YC's S3 bucket. Serving them same-origin means they render no
 * matter how strict the page's CSP is, and lets us set a real cache lifetime.
 */
app.get('/api/logo', async (c) => {
  const raw = c.req.query('u')
  if (!raw) return c.body(null, 400)
  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return c.body(null, 400)
  }
  if (target.hostname !== LOGO_HOST || !egressAllowed(target.toString())) return c.body(null, 400)

  try {
    const res = await fetch(target.toString(), { headers: { 'user-agent': UA } })
    if (!res.ok) return c.body(null, 404)
    return new Response(res.body, {
      headers: {
        'content-type': res.headers.get('content-type') ?? 'image/png',
        'cache-control': 'public, max-age=604800, immutable',
      },
    })
  } catch {
    return c.body(null, 502)
  }
})

// ── source: companies you add yourself ───────────────────────────────────────

app.get('/api/sources/custom/companies', async (c) => c.json(await custom.list()))

/**
 * Extraction is an Exa call per URL, so the client sends small batches and
 * shows progress rather than waiting on one long request.
 */
app.post('/api/sources/custom/companies', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { urls?: unknown; note?: unknown }
  const urls = Array.isArray(body.urls)
    ? body.urls.filter((u): u is string => typeof u === 'string').slice(0, 10)
    : []
  if (!urls.length) return c.json({ error: 'no URLs given' }, 400)
  try {
    return c.json(await custom.add(urls, custom.cleanNote(body.note)))
  } catch (err) {
    return fail(c, err, 502)
  }
})

/** The note is the one thing here written by hand, so it's the one thing editable. */
app.patch('/api/sources/custom/companies/:slug', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { note?: unknown }
  const company = await custom.setNote(c.req.param('slug'), body.note)
  if (!company) return c.json({ error: 'not found' }, 404)
  return c.json(company)
})

app.delete('/api/sources/custom/companies/:slug', async (c) => {
  await custom.remove(c.req.param('slug'))
  return c.body(null, 204)
})

// ── workflows ────────────────────────────────────────────────────────────────

app.get('/api/workflows', (c) =>
  c.json({
    workflows: WORKFLOWS.map((w) => ({
      id: w.id,
      label: w.label,
      description: w.description,
      collection: w.collection,
      collectionLabel: w.collectionLabel,
      valueLabel: w.valueLabel,
      costPerCompany: w.costPerCompany,
    })),
  }),
)

// ── runs ─────────────────────────────────────────────────────────────────────

app.get('/api/runs', async (c) => c.json(await listRuns()))

app.post('/api/runs', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    workflow?: unknown
    source?: unknown
    filters?: unknown
    filterLabel?: unknown
    limit?: unknown
  }
  try {
    const run = await createRun({
      workflowId: String(body.workflow ?? ''),
      source: String(body.source ?? 'yc'),
      filters: (body.filters ?? {}) as yc.SearchBody,
      filterLabel: String(body.filterLabel ?? 'All companies'),
      limit: Number(body.limit ?? 0),
    })
    return c.json(run, 201)
  } catch (err) {
    return fail(c, err, 400)
  }
})

app.get('/api/runs/:id', async (c) => {
  const run = await getRun(c.req.param('id'))
  if (!run) return c.json({ error: 'not found' }, 404)
  return c.json(run)
})

app.post('/api/runs/:id/step', async (c) => {
  try {
    const result = await step(c.req.param('id'))
    if (!result) return c.json({ error: 'not found' }, 404)
    const { filters, ...run } = result.run
    void filters
    // The last step of a run is the moment the collection changed, so the
    // reverse index the agent reads is rebuilt here rather than left stale
    // until someone opens the collection page.
    //
    // It must not cost the caller the batch it just paid for, so it runs past
    // the response where the runtime allows and is awaited where it does not.
    // Either way it cannot lose data: the catalog is written last, so a
    // rebuild cut short leaves the previous catalog in place and the
    // collection still reads as stale, which is what repairs it.
    if (run.status === 'done' || run.status === 'stopped') {
      const rebuilt = rebuildIndex(run.collection).catch(() => undefined)
      try {
        c.executionCtx.waitUntil(rebuilt)
      } catch {
        await rebuilt
      }
    }
    return c.json({ run, processed: result.processed })
  } catch (err) {
    return fail(c, err, 502)
  }
})

app.post('/api/runs/:id/stop', async (c) => {
  const run = await setStatus(c.req.param('id'), 'stopped')
  if (!run) return c.json({ error: 'not found' }, 404)
  const { filters, ...rest } = run
  void filters
  return c.json(rest)
})

app.post('/api/runs/:id/resume', async (c) => {
  const run = await setStatus(c.req.param('id'), 'running')
  if (!run) return c.json({ error: 'not found' }, 404)
  const { filters, ...rest } = run
  void filters
  return c.json(rest)
})

app.delete('/api/runs/:id', async (c) => {
  await deleteRun(c.req.param('id'))
  return c.body(null, 204)
})

// ── collections ──────────────────────────────────────────────────────────────

app.get('/api/collections', async (c) => {
  const rows = db.collection<Item>('items')
  const out = await Promise.all(
    WORKFLOWS.map(async (w) => {
      const [companies, newest] = await Promise.all([
        rows.query().where('collection', 'eq', w.collection).count(),
        rows
          .query()
          .where('collection', 'eq', w.collection)
          .orderBy('updatedAt', 'desc')
          .first(),
      ])
      return {
        name: w.collection,
        label: w.collectionLabel,
        valueLabel: w.valueLabel,
        workflow: w.id,
        description: w.description,
        companies,
        updatedAt: newest?.value.updatedAt ?? null,
      }
    }),
  )
  return c.json(out)
})

app.get('/api/collections/:name/items', async (c) => {
  const name = c.req.param('name')
  if (!WORKFLOWS.some((w) => w.collection === name)) return c.json({ error: 'not found' }, 404)
  return c.json((await collectionItems(name)).map(shapeRow))
})

/**
 * The reverse index: which companies reported each value. Built from the same
 * rows the collection page renders, and read by the Slack agent, which can only
 * fetch app records one key at a time.
 */
app.get('/api/collections/:name/index', async (c) => {
  const name = c.req.param('name')
  if (!WORKFLOWS.some((w) => w.collection === name)) return c.json({ error: 'not found' }, 404)
  return c.json(await indexStatus(name))
})

app.get('/api/collections/:name/index/catalog', async (c) => {
  const name = c.req.param('name')
  const catalog = await readCatalog(name)
  if (!catalog) return c.json({ error: 'not built' }, 404)
  return c.json(catalog)
})

app.post('/api/collections/:name/index', async (c) => {
  const name = c.req.param('name')
  if (!WORKFLOWS.some((w) => w.collection === name)) return c.json({ error: 'not found' }, 404)
  try {
    const catalog = await rebuildIndex(name)
    return c.json({
      builtAt: catalog.builtAt,
      values: catalog.values.length,
      companies: catalog.companies,
    })
  } catch (err) {
    return fail(c, err, 502)
  }
})

app.delete('/api/collections/:name', async (c) => {
  const name = c.req.param('name')
  if (!WORKFLOWS.some((w) => w.collection === name)) return c.json({ error: 'not found' }, 404)
  const deleted = await deleteCollection(name)
  await clearIndex(name).catch(() => undefined)
  return c.json({ deleted })
})

// ── bookmark lists ───────────────────────────────────────────────────────────

app.get('/api/lists', async (c) => c.json(await listLists()))

app.post('/api/lists', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown }
  try {
    return c.json(await createList(String(body.name ?? '')), 201)
  } catch (err) {
    return fail(c, err, 400)
  }
})

app.patch('/api/lists/:id', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown }
  try {
    const list = await renameList(c.req.param('id'), String(body.name ?? ''))
    if (!list) return c.json({ error: 'not found' }, 404)
    return c.json(list)
  } catch (err) {
    return fail(c, err, 400)
  }
})

app.delete('/api/lists/:id', async (c) => {
  await deleteList(c.req.param('id'))
  return c.body(null, 204)
})

app.get('/api/lists/:id/items', async (c) => c.json(await listItems(c.req.param('id'))))

app.post('/api/lists/:id/items', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { companies?: unknown }
  const companies = Array.isArray(body.companies) ? (body.companies as BookmarkTarget[]) : []
  const clean = companies
    .filter((t) => t && typeof t.slug === 'string' && typeof t.source === 'string')
    .slice(0, 2000)
  if (!clean.length) return c.json({ error: 'no companies given' }, 400)
  try {
    return c.json({ added: await addBookmarks(c.req.param('id'), clean) })
  } catch (err) {
    return fail(c, err, 400)
  }
})

app.delete('/api/lists/:id/items', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { refs?: unknown }
  const refs = Array.isArray(body.refs)
    ? (body.refs as { source: string; slug: string }[]).filter((r) => r?.slug && r?.source)
    : []
  if (!refs.length) return c.json({ error: 'no companies given' }, 400)
  return c.json({ removed: await removeBookmarks(c.req.param('id'), refs.slice(0, 2000)) })
})

/** Which lists each company sits on, for rendering bookmark state everywhere. */
app.get('/api/bookmarks', async (c) => c.json(await membership()))

export default app
