// The frontend talks only to the Hono worker; the worker is the only thing that
// may leave the origin. One call per concern, and search answers with both the
// page of hits and the facet counts that page implies.
import type { Company, SearchResponse } from './types'
import { toSearchBody, type FilterState } from './filters'

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body.slice(0, 300) || res.statusText)
  }
  return (await res.json()) as T
}

export function search(
  state: FilterState,
  page: number,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  return json<SearchResponse>('/api/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({ ...toSearchBody(state), page, hitsPerPage: 25 }),
  })
}

export const loadCompany = (slug: string) =>
  json<Company>('/api/company/' + encodeURIComponent(slug))

/** Logos come back through the worker so a strict CSP can't blank them out. */
export function logoUrl(raw: string | null): string | null {
  if (!raw) return null
  // Companies with no logo carry a relative placeholder path on the index.
  // Nothing to proxy — let the caller draw its own initial instead.
  if (!/^https:\/\//i.test(raw)) return null
  return '/api/logo?u=' + encodeURIComponent(raw)
}

// ── workflows, runs, collections ─────────────────────────────────────────────
import type { CollectionItem, CollectionSummary, IndexStatus, Run, WorkflowInfo } from './types'

export const loadWorkflows = () => json<{ workflows: WorkflowInfo[] }>('/api/workflows')

export const loadRuns = () => json<Run[]>('/api/runs')

export const loadRun = (id: string) => json<Run>('/api/runs/' + encodeURIComponent(id))

export const startRun = (input: {
  workflow: string
  source: string
  filters: unknown
  filterLabel: string
  limit: number
}) =>
  json<Run>('/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })

/** Advance one run by one batch. The caller loops this until it stops running. */
export const stepRun = (id: string) =>
  json<{ run: Run; processed: CollectionItem[] }>(
    '/api/runs/' + encodeURIComponent(id) + '/step',
    { method: 'POST' },
  )

export const stopRun = (id: string) =>
  json<Run>('/api/runs/' + encodeURIComponent(id) + '/stop', { method: 'POST' })

export const resumeRun = (id: string) =>
  json<Run>('/api/runs/' + encodeURIComponent(id) + '/resume', { method: 'POST' })

export const deleteRun = (id: string) =>
  fetch('/api/runs/' + encodeURIComponent(id), { method: 'DELETE' }).then(() => undefined)

export const loadCollections = () => json<CollectionSummary[]>('/api/collections')

export const loadCollectionItems = (name: string) =>
  json<CollectionItem[]>('/api/collections/' + encodeURIComponent(name) + '/items')

/**
 * The reverse index the Slack agent reads. The app keeps it fresh: a run
 * rebuilds it when it finishes, and opening a collection repairs one that
 * drifted (rows imported before the index existed, a run that died mid-flight).
 */
export const loadIndexStatus = (name: string) =>
  json<IndexStatus>('/api/collections/' + encodeURIComponent(name) + '/index')

export const rebuildIndex = (name: string) =>
  json<{ builtAt: string; values: number }>(
    '/api/collections/' + encodeURIComponent(name) + '/index',
    { method: 'POST' },
  )

export const clearCollection = (name: string) =>
  json<{ deleted: number }>('/api/collections/' + encodeURIComponent(name), { method: 'DELETE' })

// ── bookmark lists ───────────────────────────────────────────────────────────
import type { Bookmark, BookmarkList, BookmarkTarget, Membership } from './types'

export const loadLists = () => json<BookmarkList[]>('/api/lists')

export const loadMembership = () => json<Membership>('/api/bookmarks')

export const loadListItems = (id: string) =>
  json<Bookmark[]>('/api/lists/' + encodeURIComponent(id) + '/items')

export const createList = (name: string) =>
  json<BookmarkList>('/api/lists', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })

export const renameList = (id: string, name: string) =>
  json<BookmarkList>('/api/lists/' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })

export const deleteList = (id: string) =>
  fetch('/api/lists/' + encodeURIComponent(id), { method: 'DELETE' }).then(() => undefined)

export const addBookmarks = (listId: string, companies: BookmarkTarget[]) =>
  json<{ added: number }>('/api/lists/' + encodeURIComponent(listId) + '/items', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ companies }),
  })

export const removeBookmarks = (listId: string, refs: { source: string; slug: string }[]) =>
  json<{ removed: number }>('/api/lists/' + encodeURIComponent(listId) + '/items', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refs }),
  })

// ── the custom source ────────────────────────────────────────────────────────
import type { AddResult, CustomCompany } from './types'

export const loadCustomCompanies = () => json<CustomCompany[]>('/api/sources/custom/companies')

/**
 * One batch of URLs. The caller chunks and loops so progress is visible, and
 * passes the same note with every batch — it belongs to the paste, not the chunk.
 */
export const addCustomCompanies = (urls: string[], note = '') =>
  json<AddResult>('/api/sources/custom/companies', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ urls, note }),
  })

/** Replaces the note outright — blank clears it. */
export const setCustomCompanyNote = (slug: string, note: string) =>
  json<CustomCompany>('/api/sources/custom/companies/' + encodeURIComponent(slug), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ note }),
  })

export const removeCustomCompany = (slug: string) =>
  fetch('/api/sources/custom/companies/' + encodeURIComponent(slug), { method: 'DELETE' }).then(
    () => undefined,
  )
