import { ctx, db } from '@railcode/sdk'
import { collectTargets } from './sources'
import type { SearchBody, Target } from './yc'
import { getWorkflow, type Workflow } from './workflows'

// A run is the bridge between a filtered source list and a collection: it pins
// its targets up front, then chews through them a few at a time.
//
// Stepping rather than looping is deliberate. A worker request can't sit open
// for the minutes a few hundred Exa calls take, so the browser drives the loop
// and every step commits its results. That makes a run resumable: close the
// tab, come back, press continue.

export interface Run {
  id: string
  workflow: string
  workflowLabel: string
  collection: string
  source: string
  filterLabel: string
  /** Kept so a run can be inspected — or re-run — later. */
  filters: SearchBody
  targetCount: number
  cursor: number
  ok: number
  empty: number
  failed: number
  costUsd: number
  status: 'running' | 'done' | 'stopped' | 'error'
  error: string | null
  createdAt: string
  createdBy: string
  finishedAt: string | null
}

export interface Item {
  collection: string
  slug: string
  name: string
  batch: string
  website: string | null
  source: string
  /** Source-specific attributes (YC batch, tags, team_size, …) for filtering. */
  sourceData: Record<string, unknown>
  values: string[]
  detail: Record<string, unknown>[]
  citations: { title: string; url: string }[]
  runId: string
  status: 'ok' | 'empty' | 'error'
  error: string | null
  costUsd: number
  updatedAt: string
}

/** Companies processed per step. Sized so a step returns in a few seconds. */
const BATCH = 8

/**
 * Targets live in their own chunked records, not on the run.
 *
 * A run pins its target list up front so later steps can't drift, but a
 * thousand companies with their source attributes is far more than one KV value
 * holds — writing them inline failed with "Value too large". Chunking keeps the
 * pinning guarantee and bounds every write. A multiple of BATCH means one step
 * normally reads exactly one chunk.
 */
const CHUNK = 40

interface TargetChunk {
  runId: string
  chunk: number
  targets: Target[]
}

const runs = () => db.collection<Run>('runs')
const items = () => db.collection<Item>('items')
const chunks = () => db.collection<TargetChunk>('run_targets')

const chunkKey = (runId: string, chunk: number) => `${runId}:${String(chunk).padStart(4, '0')}`

async function writeTargets(runId: string, targets: Target[]): Promise<void> {
  const writes: Promise<unknown>[] = []
  for (let chunk = 0; chunk * CHUNK < targets.length; chunk++) {
    writes.push(
      chunks().put(chunkKey(runId, chunk), {
        runId,
        chunk,
        targets: targets.slice(chunk * CHUNK, (chunk + 1) * CHUNK),
      }),
    )
  }
  await Promise.all(writes)
}

/** The half-open range [from, to) of a run's pinned targets. */
async function readTargets(runId: string, from: number, to: number): Promise<Target[]> {
  if (to <= from) return []
  const first = Math.floor(from / CHUNK)
  const last = Math.floor((to - 1) / CHUNK)
  const loaded = await Promise.all(
    Array.from({ length: last - first + 1 }, (_, i) => chunks().get(chunkKey(runId, first + i))),
  )
  const flat = loaded.flatMap((entry) => entry?.targets ?? [])
  const offset = first * CHUNK
  return flat.slice(from - offset, to - offset)
}

async function deleteTargets(runId: string, targetCount: number): Promise<void> {
  const total = Math.ceil(targetCount / CHUNK)
  await Promise.all(
    Array.from({ length: total }, (_, chunk) => chunks().delete(chunkKey(runId, chunk))),
  )
}

/** One row per (collection, company): a re-run updates rather than duplicates. */
const itemKey = (collection: string, slug: string) => `${collection}:${slug}`

export async function createRun(input: {
  workflowId: string
  source: string
  filters: SearchBody
  filterLabel: string
  limit: number
}): Promise<Run> {
  const workflow = getWorkflow(input.workflowId)
  if (!workflow) throw new Error(`unknown workflow: ${input.workflowId}`)

  // No ceiling here on purpose: the only limit is how many companies the source
  // will enumerate for this filter (see MAX_RETRIEVABLE in yc.ts). The caller
  // sees the cost estimate before committing.
  const limit = Math.max(Math.floor(input.limit) || 0, 1)
  const targets = await collectTargets(
    input.source,
    input.filters as Record<string, unknown>,
    limit,
  )
  if (!targets.length) throw new Error('that filter matches no companies')

  const id = crypto.randomUUID()
  await writeTargets(id, targets)

  const run: Run = {
    id,
    workflow: workflow.id,
    workflowLabel: workflow.label,
    collection: workflow.collection,
    source: input.source,
    filterLabel: input.filterLabel.slice(0, 300),
    filters: input.filters,
    targetCount: targets.length,
    cursor: 0,
    ok: 0,
    empty: 0,
    failed: 0,
    costUsd: 0,
    status: 'running',
    error: null,
    createdAt: new Date().toISOString(),
    createdBy: ctx.user?.name ?? ctx.user?.email ?? 'someone',
    finishedAt: null,
  }
  await runs().put(id, run)
  return run
}

async function runOne(workflow: Workflow, run: Run, target: Target): Promise<Item> {
  const base = {
    collection: run.collection,
    slug: target.slug,
    name: target.name,
    batch: target.batch,
    website: target.website,
    source: run.source,
    sourceData: target.data ?? {},
    runId: run.id,
    updatedAt: new Date().toISOString(),
  }

  try {
    const result = await workflow.run(target)
    return {
      ...base,
      values: result.values,
      detail: result.detail,
      citations: result.citations,
      // "Found nothing" is a real, useful answer — most companies don't publish
      // a subprocessor list — so it gets its own status rather than an error.
      status: result.values.length ? 'ok' : 'empty',
      error: null,
      costUsd: result.costUsd,
    }
  } catch (err) {
    return {
      ...base,
      values: [],
      detail: [],
      citations: [],
      status: 'error',
      error: err instanceof Error ? err.message.slice(0, 300) : 'failed',
      costUsd: 0,
    }
  }
}

/** Process the next batch. Returns the updated run plus what it just wrote. */
export async function step(runId: string): Promise<{ run: Run; processed: Item[] } | null> {
  const current = await runs().get(runId)
  if (!current) return null
  if (current.status !== 'running') return { run: current, processed: [] }

  const workflow = getWorkflow(current.workflow)
  if (!workflow) {
    const failed = await runs().put(runId, {
      ...current,
      status: 'error',
      error: `unknown workflow: ${current.workflow}`,
      finishedAt: new Date().toISOString(),
    })
    return { run: failed, processed: [] }
  }

  const slice = await readTargets(
    runId,
    current.cursor,
    Math.min(current.cursor + BATCH, current.targetCount),
  )
  if (!slice.length) {
    const done = await runs().put(runId, {
      ...current,
      status: 'done',
      finishedAt: new Date().toISOString(),
    })
    return { run: done, processed: [] }
  }

  const processed = await Promise.all(slice.map((target) => runOne(workflow, current, target)))
  await Promise.all(processed.map((item) => items().put(itemKey(item.collection, item.slug), item)))

  // Re-read: a stop issued while this batch was in flight must win.
  const latest = (await runs().get(runId)) ?? current
  const cursor = current.cursor + slice.length
  const finished = cursor >= current.targetCount
  const stopped = latest.status === 'stopped'

  const updated = await runs().put(runId, {
    ...latest,
    cursor,
    ok: latest.ok + processed.filter((p) => p.status === 'ok').length,
    empty: latest.empty + processed.filter((p) => p.status === 'empty').length,
    failed: latest.failed + processed.filter((p) => p.status === 'error').length,
    costUsd: Number((latest.costUsd + processed.reduce((s, p) => s + p.costUsd, 0)).toFixed(6)),
    status: stopped ? 'stopped' : finished ? 'done' : 'running',
    finishedAt: stopped || finished ? new Date().toISOString() : null,
  })

  return { run: updated, processed }
}

export async function setStatus(runId: string, status: Run['status']): Promise<Run | null> {
  const run = await runs().get(runId)
  if (!run) return null
  return runs().put(runId, {
    ...run,
    status,
    finishedAt: status === 'running' ? null : new Date().toISOString(),
  })
}

export const getRun = (runId: string) => runs().get(runId)

export async function deleteRun(runId: string): Promise<void> {
  const run = await runs().get(runId)
  if (run) await deleteTargets(runId, run.targetCount)
  await runs().delete(runId)
}

/** Runs, newest first. The stored filter set stays server-side. */
export async function listRuns(): Promise<Omit<Run, 'filters'>[]> {
  const rows = await runs().query().orderBy('createdAt', 'desc').page(1, 100)
  return rows.map(({ value }) => {
    const { filters, ...rest } = value
    void filters
    return rest
  })
}

const PAGE = 200

/**
 * Every row in a collection.
 *
 * Counting first costs one round trip but lets every page be fetched at once —
 * walking sequentially until a short page turned a 1,300-row collection into
 * seven round trips one after another, which is most of what made the page
 * feel slow.
 */
export async function collectionItems(collection: string): Promise<Item[]> {
  const total = await items().query().where('collection', 'eq', collection).count()
  if (!total) return []

  const pages = Math.ceil(total / PAGE)
  const chunks = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      // A fresh query per page: the builder carries its own state.
      items()
        .query()
        .where('collection', 'eq', collection)
        .orderBy('updatedAt', 'desc')
        .page(i + 1, PAGE),
    ),
  )
  return chunks.flat().map((row) => row.value)
}

/** What the collection page actually renders — see shapeRow. */
export interface CollectionRow {
  slug: string
  name: string
  batch: string
  website: string | null
  source: string
  sourceData: Record<string, unknown>
  values: string[]
  citations: { host: string; url: string }[]
  status: Item['status']
  error: string | null
  costUsd: number
  updatedAt: string
}

/** Citations shown per company. The UI never rendered more than this. */
const MAX_CITATIONS = 4

/**
 * The stored row carries things the page never reads — `detail` (the per-vendor
 * purpose), the run id, the collection name already in the URL — and full
 * citation objects when the UI only shows a few de-duplicated hostnames. At
 * 1,300 rows that padding was most of a 2.6MB response.
 */
export function shapeRow(item: Item): CollectionRow {
  const seen = new Set<string>()
  const citations: { host: string; url: string }[] = []
  for (const citation of item.citations) {
    if (citations.length >= MAX_CITATIONS) break
    let host: string
    try {
      host = new URL(citation.url).hostname.replace(/^www\./, '')
    } catch {
      continue
    }
    if (!host || seen.has(host)) continue
    seen.add(host)
    citations.push({ host, url: citation.url })
  }

  return {
    slug: item.slug,
    name: item.name,
    batch: item.batch,
    website: item.website,
    source: item.source,
    sourceData: item.sourceData ?? {},
    values: item.values,
    citations,
    status: item.status,
    error: item.error,
    costUsd: item.costUsd,
    updatedAt: item.updatedAt,
  }
}

export async function deleteCollection(collection: string): Promise<number> {
  const rows = await collectionItems(collection)
  await Promise.all(rows.map((r) => items().delete(itemKey(collection, r.slug))))
  return rows.length
}
