/** One record straight off the YC Algolia index, minus the fields we strip. */
export interface Company {
  id: number
  name: string
  slug: string
  former_names: string[]
  small_logo_thumb_url: string | null
  website: string | null
  all_locations: string
  long_description: string | null
  one_liner: string | null
  team_size: number | null
  industry: string
  subindustry: string
  launched_at: number | null
  tags: string[]
  top_company: boolean
  isHiring: boolean
  nonprofit: boolean
  batch: string
  status: string
  industries: string[]
  regions: string[]
  stage: string
  app_video_public: boolean
  demo_day_video_public: boolean
  question_answers: boolean
  objectID: string
}

/** facet name -> value -> count */
export type FacetCounts = Record<string, Record<string, number>>

export interface SearchResponse {
  hits: Company[]
  /** Everything that matches… */
  nbHits: number
  /** …and the slice Algolia will actually hand over (capped, as on YC's site). */
  reachable: number
  page: number
  nbPages: number
  hitsPerPage: number
  facets: FacetCounts
  processingTimeMS: number
}

// ── workflows, runs, collections ─────────────────────────────────────────────

export interface WorkflowInfo {
  id: string
  label: string
  description: string
  collection: string
  collectionLabel: string
  valueLabel: string
  costPerCompany: number
}

export type RunStatus = 'running' | 'done' | 'stopped' | 'error'

/** A run as the client sees it — the worker strips `targets` and `filters`. */
export interface Run {
  id: string
  workflow: string
  workflowLabel: string
  collection: string
  source: string
  filterLabel: string
  targetCount: number
  cursor: number
  ok: number
  empty: number
  failed: number
  costUsd: number
  status: RunStatus
  error: string | null
  createdAt: string
  createdBy: string
  finishedAt: string | null
}

/** The shape the worker sends — see shapeRow in server/runs.ts. */
export interface CollectionItem {
  slug: string
  name: string
  batch: string
  website: string | null
  source: string
  sourceData: Record<string, unknown>
  values: string[]
  /** Already de-duplicated by host and capped, server-side. */
  citations: { host: string; url: string }[]
  status: 'ok' | 'empty' | 'error'
  error: string | null
  costUsd: number
  updatedAt: string
}

export interface CollectionSummary {
  name: string
  label: string
  valueLabel: string
  workflow: string
  description: string
  companies: number
  updatedAt: string | null
}

// ── bookmarks ────────────────────────────────────────────────────────────────

/** The company slice a bookmark keeps, so a list stands on its own. */
export interface BookmarkTarget {
  source: string
  slug: string
  name: string
  website: string | null
  batch: string
  sourceData: Record<string, unknown>
}

export interface Bookmark extends BookmarkTarget {
  listId: string
  addedAt: string
  addedBy: string
}

export interface BookmarkList {
  id: string
  name: string
  createdAt: string
  createdBy: string
  count: number
}

/** `source:slug` -> the list ids it sits on. */
export type Membership = Record<string, string[]>

// ── the custom source ────────────────────────────────────────────────────────

export interface CustomCompany {
  slug: string
  name: string
  description: string
  website: string
  url: string
  /** Why this company is here — written by hand, never by the extractor. */
  note: string
  addedAt: string
  addedBy: string
  costUsd: number
}

export interface AddResult {
  added: CustomCompany[]
  skipped: CustomCompany[]
  failed: { url: string; error: string }[]
}

/** Freshness of a collection's reverse index — see api.loadIndexStatus. */
export interface IndexStatus {
  collection: string
  builtAt: string | null
  stale: boolean
  values: number
  items: number
  newest: string | null
}
