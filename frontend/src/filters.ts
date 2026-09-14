/**
 * Filter state lives in the URL, not in a variable — these pages get pasted into
 * Slack, and a link has to reopen the same slice of the directory.
 */

export const DISJUNCTIVE = [
  'batch',
  'industry',
  'subindustry',
  'regions',
  'tags',
  'status',
] as const
export type Disjunctive = (typeof DISJUNCTIVE)[number]

export interface FilterState {
  q: string
  sort: 'relevance' | 'launch'
  selected: Record<Disjunctive, string[]>
  toggles: string[]
  size: string | null
}

export const EMPTY: FilterState = {
  q: '',
  sort: 'relevance',
  selected: { batch: [], industry: [], subindustry: [], regions: [], tags: [], status: [] },
  toggles: [],
  size: null,
}

export interface SizeBucket {
  id: string
  label: string
  min: number | null
  max: number | null
}

export const SIZE_BUCKETS: SizeBucket[] = [
  { id: '1-10', label: '1 – 10', min: 1, max: 10 },
  { id: '11-50', label: '11 – 50', min: 11, max: 50 },
  { id: '51-200', label: '51 – 200', min: 51, max: 200 },
  { id: '201-500', label: '201 – 500', min: 201, max: 500 },
  { id: '501-1000', label: '501 – 1000', min: 501, max: 1000 },
  { id: '1001+', label: '1001+', min: 1001, max: null },
]

export const TOGGLE_OPTIONS: { id: string; label: string }[] = [
  { id: 'isHiring', label: 'Is hiring' },
  { id: 'top_company', label: 'Top companies' },
  { id: 'nonprofit', label: 'Nonprofit' },
  { id: 'app_video_public', label: 'Has app video' },
  { id: 'demo_day_video_public', label: 'Has demo day video' },
  { id: 'question_answers', label: 'Has founder Q&A' },
]

export const FACET_LABEL: Record<Disjunctive, string> = {
  batch: 'Batch',
  industry: 'Industry',
  subindustry: 'Sub-industry',
  regions: 'Region',
  tags: 'Tags',
  status: 'Status',
}

// ── ordering ─────────────────────────────────────────────────────────────────

const SEASON: Record<string, number> = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 }

/** Newest batch first, the way the directory reads on YC. */
export function batchRank(batch: string): number {
  const m = batch.match(/^(Winter|Spring|Summer|Fall)\s+(\d{4})$/)
  if (!m) return -1
  return Number(m[2]) * 10 + SEASON[m[1]]
}

export const STATUS_ORDER = ['Active', 'Public', 'Acquired', 'Inactive']

// ── URL <-> state ────────────────────────────────────────────────────────────
// Repeated params rather than comma-joined ones: several facet values contain
// punctuation ("B2B -> Analytics", "America / Canada") and this sidesteps
// inventing an escape.

export function toQuery(state: FilterState): string {
  const params = new URLSearchParams()
  if (state.q.trim()) params.set('q', state.q.trim())
  if (state.sort !== 'relevance') params.set('sort', state.sort)
  for (const facet of DISJUNCTIVE) {
    for (const value of state.selected[facet]) params.append(facet, value)
  }
  for (const toggle of state.toggles) params.append('t', toggle)
  if (state.size) params.set('size', state.size)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function fromQuery(search: string): FilterState {
  const params = new URLSearchParams(search)
  const selected = {} as Record<Disjunctive, string[]>
  for (const facet of DISJUNCTIVE) selected[facet] = params.getAll(facet)
  const size = params.get('size')
  return {
    q: params.get('q') ?? '',
    sort: params.get('sort') === 'launch' ? 'launch' : 'relevance',
    selected,
    toggles: params.getAll('t').filter((t) => TOGGLE_OPTIONS.some((o) => o.id === t)),
    size: SIZE_BUCKETS.some((b) => b.id === size) ? size : null,
  }
}

export function activeCount(state: FilterState): number {
  let n = state.toggles.length + (state.size ? 1 : 0)
  for (const facet of DISJUNCTIVE) n += state.selected[facet].length
  return n
}

export function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/** A short human description of a filter set — what a run gets labelled with. */
export function describe(state: FilterState): string {
  const parts: string[] = []
  if (state.q.trim()) parts.push(`“${state.q.trim()}”`)
  for (const facet of DISJUNCTIVE) {
    const values = state.selected[facet]
    if (!values.length) continue
    const shown = values
      .map((v) => (facet === 'subindustry' && v.includes(' -> ') ? v.slice(v.indexOf(' -> ') + 4) : v))
      .slice(0, 3)
    const extra = values.length - shown.length
    parts.push(`${FACET_LABEL[facet]}: ${shown.join(', ')}${extra > 0 ? ` +${extra}` : ''}`)
  }
  const bucket = SIZE_BUCKETS.find((b) => b.id === state.size)
  if (bucket) parts.push(`${bucket.label} people`)
  for (const id of state.toggles) {
    const option = TOGGLE_OPTIONS.find((o) => o.id === id)
    if (option) parts.push(option.label)
  }
  return parts.length ? parts.join(' · ') : 'All companies'
}

/** The request body the worker expects for a search or a run's target list. */
export function toSearchBody(state: FilterState) {
  const bucket = SIZE_BUCKETS.find((b) => b.id === state.size)
  return {
    q: state.q,
    sort: state.sort,
    selected: state.selected,
    toggles: state.toggles,
    minSize: bucket?.min ?? null,
    maxSize: bucket?.max ?? null,
  }
}
