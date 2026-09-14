// Everything that knows about Y Combinator's directory lives here: the public
// Algolia index behind ycombinator.com/companies, the key that unlocks it, and
// the disjunctive faceting the sidebar needs.
//
// This is one *source* among the several the app expects to grow. Anything that
// isn't YC-specific — runs, collections, workflows — stays out of this file.
import { db } from '@railcode/sdk'
import { UA, egressAllowed } from './net'

const ALGOLIA_APP = '45BWZJ1SGC'

/** Last known good key, used only if YC's page can't be read at all. */
const FALLBACK_KEY =
  'NzllNTY5MzJiZGM2OTY2ZTQwMDEzOTNhYWZiZGRjODlhYzVkNjBmOGRjNzJiMWM4ZTU0ZDlhYTZjOTJiMjlhMWFuYWx5dGljc1RhZ3M9eWNkYyZyZXN0cmljdEluZGljZXM9WUNDb21wYW55X3Byb2R1Y3Rpb24lMkNZQ0NvbXBhbnlfQnlfTGF1bmNoX0RhdGVfcHJvZHVjdGlvbiZ0YWdGaWx0ZXJzPSU1QiUyMnljZGNfcHVibGljJTIyJTVE'

const INDEX = {
  relevance: 'YCCompany_production',
  launch: 'YCCompany_By_Launch_Date_production',
} as const

const YC_COMPANIES_URL = 'https://www.ycombinator.com/companies'

// ── credentials ──────────────────────────────────────────────────────────────
// The key is public — it ships in the page source — but it is a *secured* key
// that YC rotates. Re-reading it from the page keeps the app alive across a
// rotation; caching it keeps us from fetching a 30KB HTML page per search.

interface CachedCreds {
  appId: string
  key: string
  at: number
}

const CRED_TTL_MS = 12 * 60 * 60 * 1000

async function scrapeCreds(): Promise<{ appId: string; key: string } | null> {
  if (!egressAllowed(YC_COMPANIES_URL)) return null
  try {
    const res = await fetch(YC_COMPANIES_URL, {
      headers: { 'user-agent': UA, accept: 'text/html' },
    })
    if (!res.ok) return null
    const html = await res.text()
    const match = html.match(/window\.AlgoliaOpts\s*=\s*(\{[\s\S]*?\})\s*;/)
    if (!match) return null
    const opts = JSON.parse(match[1]) as { app?: unknown; key?: unknown }
    if (typeof opts.app !== 'string' || typeof opts.key !== 'string') return null
    if (!opts.app || !opts.key) return null
    return { appId: opts.app, key: opts.key }
  } catch {
    return null
  }
}

async function creds(): Promise<{ appId: string; key: string }> {
  const meta = db.collection<CachedCreds>('meta')
  const cached = await meta.get('algolia').catch(() => null)
  if (cached && Date.now() - cached.at < CRED_TTL_MS) {
    return { appId: cached.appId, key: cached.key }
  }
  const fresh = await scrapeCreds()
  if (fresh) {
    await meta.put('algolia', { ...fresh, at: Date.now() }).catch(() => {})
    return fresh
  }
  // A stale key still beats no key: YC rotates rarely, and the next request
  // tries the page again.
  if (cached) return { appId: cached.appId, key: cached.key }
  return { appId: ALGOLIA_APP, key: FALLBACK_KEY }
}

// ── query building ───────────────────────────────────────────────────────────

/** Facets the user picks several values from — these need disjunctive counts. */
export const DISJUNCTIVE = [
  'batch',
  'industry',
  'subindustry',
  'regions',
  'tags',
  'status',
] as const
export type Disjunctive = (typeof DISJUNCTIVE)[number]

/** Single-value boolean facets, applied as plain AND filters. */
const TOGGLES: Record<string, string> = {
  isHiring: 'isHiring:true',
  top_company: 'top_company:true',
  nonprofit: 'nonprofit:true',
  app_video_public: 'app_video_public:true',
  demo_day_video_public: 'demo_day_video_public:true',
  question_answers: 'question_answers:true',
}

const ALL_FACETS = [...DISJUNCTIVE, ...Object.keys(TOGGLES)]

/** Algolia caps retrievable hits per query; the real site has the same ceiling. */
export const MAX_RETRIEVABLE = 1000

export interface SearchBody {
  q?: unknown
  page?: unknown
  hitsPerPage?: unknown
  sort?: unknown
  selected?: unknown
  toggles?: unknown
  minSize?: unknown
  maxSize?: unknown
}

interface Query {
  q: string
  page: number
  hitsPerPage: number
  index: string
  selected: Record<Disjunctive, string[]>
  toggles: string[]
  minSize: number | null
  maxSize: number | null
}

function strings(value: unknown, cap = 200): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0).slice(0, cap)
}

function posInt(value: unknown): number | null {
  // Guard the empties explicitly: Number(null) and Number('') are both 0, which
  // would turn "no size filter" into team_size >= 0 AND <= 0.
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

function parseQuery(body: SearchBody): Query {
  const raw = (body.selected ?? {}) as Record<string, unknown>
  const selected = {} as Record<Disjunctive, string[]>
  for (const facet of DISJUNCTIVE) selected[facet] = strings(raw[facet])

  const hitsPerPage = Math.min(Math.max(posInt(body.hitsPerPage) ?? 25, 1), 100)
  const sort = body.sort === 'launch' ? 'launch' : 'relevance'

  return {
    q: typeof body.q === 'string' ? body.q.slice(0, 200) : '',
    page: Math.min(posInt(body.page) ?? 0, Math.floor(MAX_RETRIEVABLE / hitsPerPage) - 1),
    hitsPerPage,
    index: INDEX[sort],
    selected,
    toggles: strings(body.toggles, 20).filter((t) => t in TOGGLES),
    minSize: posInt(body.minSize),
    maxSize: posInt(body.maxSize),
  }
}

/**
 * OR within an inner array, AND across the outer one. `skip` drops one facet's
 * own refinements — that is exactly what makes its counts disjunctive.
 */
function facetFilters(q: Query, skip?: Disjunctive): string[][] {
  const out: string[][] = []
  for (const facet of DISJUNCTIVE) {
    if (facet === skip) continue
    const values = q.selected[facet]
    if (values.length) out.push(values.map((v) => `${facet}:${v}`))
  }
  for (const toggle of q.toggles) out.push([TOGGLES[toggle]])
  return out
}

function numericFilters(q: Query): string[] {
  const out: string[] = []
  if (q.minSize !== null) out.push(`team_size>=${q.minSize}`)
  if (q.maxSize !== null) out.push(`team_size<=${q.maxSize}`)
  return out
}

/** Algolia takes each request's options as a URL-encoded query string. */
function toParams(options: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value) && value.length === 0) continue
    params.set(key, typeof value === 'string' ? value : JSON.stringify(value))
  }
  return params.toString()
}

interface AlgoliaResult {
  hits?: Record<string, unknown>[]
  nbHits?: number
  page?: number
  nbPages?: number
  facets?: Record<string, Record<string, number>>
  processingTimeMS?: number
}

async function algolia(requests: { indexName: string; params: string }[]): Promise<AlgoliaResult[]> {
  const { appId, key } = await creds()
  const url = `https://${appId.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`
  if (!egressAllowed(url)) throw new Error('algolia host not permitted by egress')

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': appId,
      'X-Algolia-API-Key': key,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) throw new Error(`algolia ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as { results?: AlgoliaResult[] }
  return json.results ?? []
}

/** Trim the wire payload: highlights and internals the UI never reads. */
function shapeHit(hit: Record<string, unknown>): Record<string, unknown> {
  const { _highlightResult, tags_highlighted, app_answers, ...rest } = hit
  void _highlightResult
  void tags_highlighted
  void app_answers
  return rest
}

// ── the public surface ───────────────────────────────────────────────────────

/**
 * `withFacets: false` skips the disjunctive refinement queries — a run pinning
 * its target list wants pages of hits, not counts, and those extra queries are
 * pure waste over ten pages.
 */
export async function search(body: SearchBody, withFacets = true) {
  const q = parseQuery(body)

  const shared = {
    query: q.q,
    facetFilters: facetFilters(q),
    numericFilters: numericFilters(q),
    maxValuesPerFacet: 1000,
  }

  // One request for the results and their (conjunctive) facet counts…
  const requests = [
    {
      indexName: q.index,
      params: toParams({
        ...shared,
        page: q.page,
        hitsPerPage: q.hitsPerPage,
        facets: withFacets ? ALL_FACETS : undefined,
      }),
    },
  ]

  // …then one hit-less request per *refined* facet, with that facet's own
  // refinements removed, so its counts answer "what if I also picked this?"
  // instead of collapsing to the values already chosen.
  const refined = withFacets ? DISJUNCTIVE.filter((facet) => q.selected[facet].length > 0) : []
  for (const facet of refined) {
    requests.push({
      indexName: q.index,
      params: toParams({
        query: q.q,
        facetFilters: facetFilters(q, facet),
        numericFilters: numericFilters(q),
        maxValuesPerFacet: 1000,
        page: 0,
        hitsPerPage: 0,
        facets: [facet],
        analytics: false,
      }),
    })
  }

  const results = await algolia(requests)
  const main = results[0] ?? {}
  const facets: Record<string, Record<string, number>> = { ...(main.facets ?? {}) }
  refined.forEach((facet, i) => {
    const counts = results[i + 1]?.facets?.[facet]
    if (counts) facets[facet] = counts
  })

  const nbHits = main.nbHits ?? 0
  return {
    hits: (main.hits ?? []).map(shapeHit),
    nbHits,
    reachable: Math.min(nbHits, MAX_RETRIEVABLE),
    page: main.page ?? q.page,
    nbPages: Math.min(main.nbPages ?? 0, Math.floor(MAX_RETRIEVABLE / q.hitsPerPage)),
    hitsPerPage: q.hitsPerPage,
    facets,
    processingTimeMS: main.processingTimeMS ?? 0,
  }
}

/**
 * Deep links land on /companies/:slug before any search has run, so the drawer
 * needs a way to resolve one company on its own. `slug` isn't a filterable
 * attribute on the index, so search for it and match exactly.
 */
export async function bySlug(slug: string): Promise<Record<string, unknown> | null> {
  const results = await algolia([
    {
      indexName: INDEX.relevance,
      params: toParams({
        query: slug.replace(/-/g, ' '),
        hitsPerPage: 30,
        page: 0,
        analytics: false,
      }),
    },
  ])
  const hit = (results[0]?.hits ?? []).find((h) => h.slug === slug)
  return hit ? shapeHit(hit) : null
}

/**
 * One company as a workflow target. `data` is the source-specific attribute bag
 * that follows the company into a collection, so the collection can be filtered
 * by the same axes the source offers — batch, industry, tags, and so on.
 */
export interface Target {
  slug: string
  name: string
  website: string | null
  batch: string
  data: Record<string, unknown>
}

/** The YC attributes worth carrying into a collection row. */
const CARRIED = [
  'batch',
  'industry',
  'subindustry',
  'tags',
  'regions',
  'status',
  'stage',
  'team_size',
  'all_locations',
  'isHiring',
  'top_company',
  'nonprofit',
] as const

function carry(hit: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of CARRIED) if (hit[key] !== undefined && hit[key] !== null) out[key] = hit[key]
  return out
}

/**
 * Walk a filtered result set into a flat target list. A run pins its targets up
 * front so later steps can't drift if the index changes mid-run.
 */
export async function collectTargets(body: SearchBody, limit: number): Promise<Target[]> {
  const perPage = 100
  const out: Target[] = []
  const seen = new Set<string>()

  for (let page = 0; out.length < limit && page < MAX_RETRIEVABLE / perPage; page++) {
    const result = await search({ ...body, page, hitsPerPage: perPage }, false)
    const hits = result.hits as unknown as Record<string, unknown>[]
    if (!hits.length) break

    for (const hit of hits) {
      const slug = typeof hit.slug === 'string' ? hit.slug : null
      if (!slug || seen.has(slug)) continue
      seen.add(slug)
      out.push({
        slug,
        name: typeof hit.name === 'string' ? hit.name : slug,
        website: typeof hit.website === 'string' ? hit.website : null,
        batch: typeof hit.batch === 'string' ? hit.batch : '',
        data: carry(hit),
      })
      if (out.length >= limit) break
    }
    if (page + 1 >= result.nbPages) break
  }

  return out
}
