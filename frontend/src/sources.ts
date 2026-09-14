import { SIZE_BUCKETS, batchRank, STATUS_ORDER } from './filters'
import type { Entry } from './FacetGroup'
import type { CollectionItem } from './types'

/**
 * A collection mixes companies from different sources, and each source has its
 * own idea of what a company *is* — YC has batches and industries, the next one
 * won't. So filters are scoped: pick a source, and that source's axes appear.
 *
 * Adding a source means adding an entry here plus a `collectTargets` that fills
 * `sourceData` with these keys. Nothing in the collection UI is YC-specific.
 */

export type FacetKind = 'list' | 'value'

export interface SourceFacet {
  key: string
  label: string
  kind: FacetKind
  searchable?: boolean
  order?: 'count' | 'batch' | 'status'
}

export interface SourceDef {
  id: string
  label: string
  facets: SourceFacet[]
  /** Boolean attributes, shown together as on/off switches. */
  toggles: { key: string; label: string }[]
  /** Numeric attribute bucketed by SIZE_BUCKETS, if the source has one. */
  sizeKey?: string
}

export const SOURCES: SourceDef[] = [
  {
    id: 'yc',
    label: 'Y Combinator',
    facets: [
      { key: 'batch', label: 'Batch', kind: 'value', order: 'batch', searchable: true },
      { key: 'industry', label: 'Industry', kind: 'value' },
      { key: 'subindustry', label: 'Sub-industry', kind: 'value', searchable: true },
      { key: 'tags', label: 'Tags', kind: 'list', searchable: true },
      { key: 'regions', label: 'Region', kind: 'list', searchable: true },
      { key: 'status', label: 'Company status', kind: 'value', order: 'status' },
      { key: 'stage', label: 'Stage', kind: 'value' },
    ],
    toggles: [
      { key: 'isHiring', label: 'Is hiring' },
      { key: 'top_company', label: 'Top company' },
      { key: 'nonprofit', label: 'Nonprofit' },
    ],
    sizeKey: 'team_size',
  },
  {
    id: 'custom',
    label: 'Custom companies',
    // Nothing but what Exa extracted, so there is nothing meaningful to facet
    // on yet. The bar simply shows no axes for this source.
    facets: [],
    toggles: [],
  },
]

export const sourceById = (id: string | null): SourceDef | null =>
  (id && SOURCES.find((s) => s.id === id)) || null

export const RESULT_STATUS = [
  { id: 'ok', label: 'With results' },
  { id: 'empty', label: 'Published nothing' },
  { id: 'error', label: 'Failed' },
]

export interface CollectionFilter {
  source: string | null
  status: string[]
  /** facet key -> selected values */
  values: Record<string, string[]>
  toggles: string[]
  size: string | null
}

export const EMPTY_FILTER: CollectionFilter = {
  source: null,
  status: [],
  values: {},
  toggles: [],
  size: null,
}

// ── URL <-> state ────────────────────────────────────────────────────────────

export function filterToQuery(state: CollectionFilter): string {
  const params = new URLSearchParams()
  if (state.source) params.set('source', state.source)
  for (const value of state.status) params.append('st', value)
  for (const [key, values] of Object.entries(state.values)) {
    for (const value of values) params.append('f.' + key, value)
  }
  for (const toggle of state.toggles) params.append('tg', toggle)
  if (state.size) params.set('size', state.size)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function filterFromQuery(search: string): CollectionFilter {
  const params = new URLSearchParams(search)
  const source = params.get('source')
  const values: Record<string, string[]> = {}
  for (const [key, value] of params.entries()) {
    if (!key.startsWith('f.')) continue
    const facet = key.slice(2)
    ;(values[facet] ??= []).push(value)
  }
  const size = params.get('size')
  return {
    source: SOURCES.some((s) => s.id === source) ? source : null,
    status: params.getAll('st').filter((s) => RESULT_STATUS.some((r) => r.id === s)),
    values,
    toggles: params.getAll('tg'),
    size: SIZE_BUCKETS.some((b) => b.id === size) ? size : null,
  }
}

export function activeCount(state: CollectionFilter): number {
  return (
    (state.source ? 1 : 0) +
    state.status.length +
    state.toggles.length +
    (state.size ? 1 : 0) +
    Object.values(state.values).reduce((n, v) => n + v.length, 0)
  )
}

// ── reading and matching ─────────────────────────────────────────────────────

export function readFacet(item: CollectionItem, facet: SourceFacet): string[] {
  const raw = item.sourceData?.[facet.key]
  if (raw === undefined || raw === null || raw === '') return []
  if (facet.kind === 'list') {
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
  }
  return [String(raw)]
}

/**
 * `skip` drops one axis from the test — that is what makes a facet's counts
 * answer "what if I also picked this?" rather than collapsing to what's chosen.
 */
export function matches(
  item: CollectionItem,
  state: CollectionFilter,
  source: SourceDef | null,
  skip?: string,
): boolean {
  if (skip !== '__source' && state.source && item.source !== state.source) return false
  if (skip !== '__status' && state.status.length && !state.status.includes(item.status)) return false
  if (!source) return true

  for (const facet of source.facets) {
    if (facet.key === skip) continue
    const selected = state.values[facet.key]
    if (!selected?.length) continue
    const have = readFacet(item, facet)
    if (!selected.some((v) => have.includes(v))) return false
  }

  for (const toggle of state.toggles) {
    if (toggle === skip) continue
    if (String(item.sourceData?.[toggle]) !== 'true') return false
  }

  if (skip !== '__size' && state.size && source.sizeKey) {
    const bucket = SIZE_BUCKETS.find((b) => b.id === state.size)
    const n = Number(item.sourceData?.[source.sizeKey])
    if (!Number.isFinite(n)) return false
    if (bucket) {
      if (bucket.min !== null && n < bucket.min) return false
      if (bucket.max !== null && n > bucket.max) return false
    }
  }

  return true
}

export interface Counts {
  sources: Record<string, number>
  status: Record<string, number>
  facets: Record<string, Record<string, number>>
  sizes: Record<string, number>
}

/** Every count the rail shows, each computed with its own axis removed. */
export function counts(
  items: CollectionItem[],
  state: CollectionFilter,
  source: SourceDef | null,
): Counts {
  const out: Counts = { sources: {}, status: {}, facets: {}, sizes: {} }

  for (const item of items) {
    if (matches(item, state, source, '__source')) {
      out.sources[item.source] = (out.sources[item.source] ?? 0) + 1
    }
    if (matches(item, state, source, '__status')) {
      out.status[item.status] = (out.status[item.status] ?? 0) + 1
    }
  }

  if (!source) return out

  for (const facet of source.facets) {
    const counted: Record<string, number> = {}
    for (const item of items) {
      if (!matches(item, state, source, facet.key)) continue
      for (const value of readFacet(item, facet)) counted[value] = (counted[value] ?? 0) + 1
    }
    out.facets[facet.key] = counted
  }

  for (const toggle of source.toggles) {
    let n = 0
    for (const item of items) {
      if (!matches(item, state, source, toggle.key)) continue
      if (String(item.sourceData?.[toggle.key]) === 'true') n++
    }
    out.facets[toggle.key] = { true: n }
  }

  if (source.sizeKey) {
    for (const bucket of SIZE_BUCKETS) {
      let n = 0
      for (const item of items) {
        if (!matches(item, state, source, '__size')) continue
        const size = Number(item.sourceData?.[source.sizeKey])
        if (!Number.isFinite(size)) continue
        if (bucket.min !== null && size < bucket.min) continue
        if (bucket.max !== null && size > bucket.max) continue
        n++
      }
      out.sizes[bucket.id] = n
    }
  }

  return out
}

/** Facet-specific ordering, matching how the source itself presents them. */
export function sorterFor(facet: SourceFacet): (a: Entry, b: Entry) => number {
  if (facet.order === 'batch') return (a, b) => batchRank(b[0]) - batchRank(a[0])
  if (facet.order === 'status') {
    return (a, b) =>
      (STATUS_ORDER.indexOf(a[0]) + 1 || 99) - (STATUS_ORDER.indexOf(b[0]) + 1 || 99)
  }
  return (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
}
