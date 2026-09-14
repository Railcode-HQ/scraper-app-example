import { ctx, db } from '@railcode/sdk'

// Bookmarks are the manual counterpart to a run: a person curating companies
// into named lists, rather than a workflow filling a collection.
//
// One record per (list, company) — so a company sits on as many lists as you
// like, and adding it to a second list never disturbs the first.

export interface BookmarkList {
  id: string
  name: string
  createdAt: string
  createdBy: string
}

/** The company slice a list needs to stand on its own, without the source. */
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

const lists = () => db.collection<BookmarkList>('lists')
const marks = () => db.collection<Bookmark>('bookmarks')

const markKey = (listId: string, source: string, slug: string) => `${listId}:${source}:${slug}`

/** Stable identity for a company across sources. */
export const companyRef = (source: string, slug: string) => `${source}:${slug}`

const PAGE = 200

/** Count first, then fetch every page at once — see collectionItems. */
async function allMarks(listId?: string): Promise<Bookmark[]> {
  const build = () => {
    const query = marks().query()
    return listId ? query.where('listId', 'eq', listId) : query
  }

  const total = await build().count()
  if (!total) return []

  const chunks = await Promise.all(
    Array.from({ length: Math.ceil(total / PAGE) }, (_, i) =>
      build().orderBy('addedAt', 'desc').page(i + 1, PAGE),
    ),
  )
  return chunks.flat().map((row) => row.value)
}

export async function listLists(): Promise<(BookmarkList & { count: number })[]> {
  const rows = await lists().query().orderBy('createdAt', 'asc').page(1, 200)
  return Promise.all(
    rows.map(async ({ value }) => ({
      ...value,
      count: await marks().query().where('listId', 'eq', value.id).count(),
    })),
  )
}

export async function createList(name: string): Promise<BookmarkList> {
  const clean = name.trim().slice(0, 80)
  if (!clean) throw new Error('a list needs a name')
  const id = crypto.randomUUID()
  return lists().put(id, {
    id,
    name: clean,
    createdAt: new Date().toISOString(),
    createdBy: ctx.user?.name ?? ctx.user?.email ?? 'someone',
  })
}

export async function renameList(id: string, name: string): Promise<BookmarkList | null> {
  const current = await lists().get(id)
  if (!current) return null
  const clean = name.trim().slice(0, 80)
  if (!clean) throw new Error('a list needs a name')
  return lists().put(id, { ...current, name: clean })
}

export async function deleteList(id: string): Promise<void> {
  const rows = await allMarks(id)
  await Promise.all(rows.map((r) => marks().delete(markKey(id, r.source, r.slug))))
  await lists().delete(id)
}

export const listItems = (listId: string) => allMarks(listId)

export async function addBookmarks(listId: string, targets: BookmarkTarget[]): Promise<number> {
  const list = await lists().get(listId)
  if (!list) throw new Error('no such list')
  const now = new Date().toISOString()
  const addedBy = ctx.user?.name ?? ctx.user?.email ?? 'someone'

  // Re-adding is a no-op rather than an error: bulk-bookmarking a subprocessor's
  // companies will nearly always overlap something already on the list.
  await Promise.all(
    targets.map((target) =>
      marks().put(markKey(listId, target.source, target.slug), {
        ...target,
        sourceData: target.sourceData ?? {},
        listId,
        addedAt: now,
        addedBy,
      }),
    ),
  )
  return targets.length
}

export async function removeBookmarks(
  listId: string,
  refs: { source: string; slug: string }[],
): Promise<number> {
  await Promise.all(refs.map((r) => marks().delete(markKey(listId, r.source, r.slug))))
  return refs.length
}

/**
 * `source:slug` -> the lists it sits on. Small enough to hand the client whole,
 * which is what lets every row show its bookmark state without a call each.
 */
export async function membership(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {}
  for (const mark of await allMarks()) {
    ;(out[companyRef(mark.source, mark.slug)] ??= []).push(mark.listId)
  }
  return out
}
