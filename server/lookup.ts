import { db } from '@railcode/sdk'
import { normalize } from './normalize'
import { collectionItems, type Item } from './runs'
import { getWorkflowByCollection } from './workflows'

// A collection is stored the way it is written: one row per company, listing
// the values found for it. Every interesting question reads it backwards —
// "which companies use Retool" — and KV has no "array contains" operator, so
// answering it means scanning all 1,300 rows.
//
// That is fine for the collection page, which loads them anyway. It is not fine
// for the Slack agent, which reads app KV one record at a time and would put
// ~380KB through its context per question. So a rebuild writes the reverse
// index the question actually wants: one record per distinct value naming the
// companies that reported it, plus a catalog listing every value with its
// count. A question then costs one catalog read and one keyed lookup.

const items = () => db.collection<Item>('items')
const vendors = () => db.collection<VendorEntry>('vendor_index')
const catalogs = () => db.collection<Catalog>('vendor_catalog')

const vendorKey = (collection: string, key: string) => `${collection}:${key}`

/** A company as the index reports it: enough to answer without a second read. */
export interface IndexedCompany {
  slug: string
  name: string
  batch: string
  website: string | null
  source: string
  industry?: string
  subindustry?: string
  stage?: string
  teamSize?: number
  location?: string
  tags?: string[]
  /** What the company says it uses this vendor for, when it says. */
  purpose?: string
}

export interface VendorEntry {
  collection: string
  key: string
  /** The most common spelling, used when the answer names the vendor. */
  value: string
  /** Every spelling folded into this key. */
  variants: string[]
  /** Shorthands seen in parentheses, e.g. ["AWS"]. */
  aliases: string[]
  count: number
  companies: IndexedCompany[]
  /** Companies past the per-record cap, counted but not listed. */
  omitted: number
  builtAt: string
}

export interface Catalog {
  collection: string
  label: string
  valueLabel: string
  builtAt: string
  /** What the index was built from — compared to decide staleness. */
  items: number
  newest: string | null
  companies: { total: number; withValues: number; withoutValues: number; errors: number }
  batches: [string, number][]
  industries: [string, number][]
  /** [display, company count, lookup key], most used first. */
  values: [string, number, string][]
  /** Only the keys that have one, so the common case costs nothing. */
  aliases: Record<string, string[]>
  /** [slug, name, batch, values found], for name → slug. */
  companyIndex: [string, string, string, number][]
  /** Values past the byte budget, counted but not listed. */
  omitted: number
}

/**
 * A KV value over ~128KB is rejected outright ("Value too large"), so both the
 * catalog and any one vendor record stay well inside that. Stripe, the widest
 * row so far, lists 118 companies in ~40KB.
 */
const MAX_VALUE_BYTES = 100_000
const MAX_COMPANIES = 400

/** KV writes go out in parallel, but not 700 at once. */
async function mapLimit<T>(input: T[], limit: number, fn: (item: T) => Promise<unknown>) {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, input.length) }, async () => {
    while (cursor < input.length) await fn(input[cursor++])
  })
  await Promise.all(workers)
}

function sourceFacts(item: Item): Omit<IndexedCompany, 'slug' | 'name' | 'batch' | 'website' | 'source' | 'purpose'> {
  const data = item.sourceData ?? {}
  const text = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : undefined)
  return {
    industry: text('industry'),
    subindustry: text('subindustry'),
    stage: text('stage'),
    teamSize: typeof data.team_size === 'number' ? data.team_size : undefined,
    location: text('all_locations'),
    tags: Array.isArray(data.tags) ? (data.tags as string[]).slice(0, 8) : undefined,
  }
}

/** Undefined fields would otherwise ship as JSON noise on every company. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

interface Group {
  key: string
  /** Spelling → how many companies used it, so the winner is the common one. */
  names: Map<string, number>
  aliases: Set<string>
  companies: IndexedCompany[]
}

function groupRows(rows: Item[]): Map<string, Group> {
  const groups = new Map<string, Group>()

  for (const item of rows) {
    if (!item.values?.length) continue
    const facts = sourceFacts(item)

    // detail[] carries the purpose alongside the same name that is in values[],
    // so match it through the same fold rather than by raw string.
    const purposes = new Map<string, string>()
    for (const entry of item.detail ?? []) {
      const name = typeof entry?.name === 'string' ? entry.name : ''
      const purpose = typeof entry?.purpose === 'string' ? entry.purpose.trim() : ''
      if (name && purpose) purposes.set(normalize(name).key, purpose.slice(0, 160))
    }

    // A company that lists "AWS" and "Amazon Web Services, Inc." must count once
    // per group, not twice.
    const seen = new Set<string>()

    for (const raw of item.values) {
      const { key, display, alias } = normalize(raw)
      if (!key) continue

      let group = groups.get(key)
      if (!group) {
        group = { key, names: new Map(), aliases: new Set(), companies: [] }
        groups.set(key, group)
      }
      if (alias) group.aliases.add(alias)
      if (seen.has(key)) continue
      seen.add(key)

      group.names.set(display, (group.names.get(display) ?? 0) + 1)
      group.companies.push(
        compact({
          slug: item.slug,
          name: item.name,
          batch: item.batch,
          website: item.website,
          source: item.source,
          ...facts,
          purpose: purposes.get(key),
        }),
      )
    }
  }

  return groups
}

const commonest = (names: Map<string, number>): string =>
  [...names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]

/** Counts by field across every scanned row, for coverage questions. */
function tally(rows: Item[], read: (item: Item) => string | undefined): [string, number][] {
  const counts = new Map<string, number>()
  for (const item of rows) {
    const value = read(item)
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 60)
}

/** Every key currently indexed for a collection, so removed ones can go. */
async function indexedKeys(collection: string): Promise<string[]> {
  const prefix = `${collection}:`
  const keys: string[] = []
  for (let page = 1; page <= 50; page++) {
    const rows = await vendors().prefix(prefix).page(page, 200)
    keys.push(...rows.map((row) => row.key))
    if (rows.length < 200) break
  }
  return keys
}

/** What the index was built from, as two cheap queries. */
async function watermarkOf(collection: string): Promise<{ items: number; newest: string | null }> {
  const [count, newest] = await Promise.all([
    items().query().where('collection', 'eq', collection).count(),
    items().query().where('collection', 'eq', collection).orderBy('updatedAt', 'desc').first(),
  ])
  return { items: count, newest: newest?.value.updatedAt ?? null }
}

export interface IndexStatus {
  collection: string
  builtAt: string | null
  stale: boolean
  values: number
  items: number
  newest: string | null
}

export async function indexStatus(collection: string): Promise<IndexStatus> {
  const [catalog, mark] = await Promise.all([catalogs().get(collection), watermarkOf(collection)])
  return {
    collection,
    builtAt: catalog?.builtAt ?? null,
    stale: !catalog || catalog.items !== mark.items || catalog.newest !== mark.newest,
    values: catalog?.values.length ?? 0,
    ...mark,
  }
}

export const readCatalog = (collection: string) => catalogs().get(collection)

/**
 * Rebuild a collection's reverse index and write it.
 *
 * Pass `rows` only when they are the collection's COMPLETE set — the catalog
 * records them as the watermark that decides whether the index is stale, so a
 * filtered subset would mark a partial index as current.
 */
export async function rebuildIndex(collection: string, rows?: Item[]): Promise<Catalog> {
  const all = rows ?? (await collectionItems(collection))
  const { entries, catalog } = buildIndex(collection, all)

  const fresh = new Set(entries.map((entry) => vendorKey(collection, entry.key)))
  const stale = (await indexedKeys(collection)).filter((key) => !fresh.has(key))

  await mapLimit(entries, 24, (entry) => vendors().put(vendorKey(collection, entry.key), entry))
  await mapLimit(stale, 24, (key) => vendors().delete(key))
  await catalogs().put(collection, catalog)

  return catalog
}

/**
 * The index itself, as a pure function of the rows.
 *
 * Kept free of storage so the same code can build it anywhere — the worker
 * writes the result to KV, and a one-off backfill can compute it outside the
 * worker without a second, drifting implementation of the rule.
 */
export function buildIndex(
  collection: string,
  all: Item[],
): { entries: VendorEntry[]; catalog: Catalog } {
  const workflow = getWorkflowByCollection(collection)
  const groups = groupRows(all)
  const builtAt = new Date().toISOString()

  const ordered = [...groups.values()].sort(
    (a, b) => b.companies.length - a.companies.length || a.key.localeCompare(b.key),
  )

  const entries: VendorEntry[] = ordered.map((group) => ({
    collection,
    key: group.key,
    value: commonest(group.names),
    variants: [...group.names.keys()],
    aliases: [...group.aliases],
    count: group.companies.length,
    companies: group.companies.slice(0, MAX_COMPANIES),
    omitted: Math.max(0, group.companies.length - MAX_COMPANIES),
    builtAt,
  }))

  const catalog: Catalog = {
    collection,
    label: workflow?.collectionLabel ?? collection,
    valueLabel: workflow?.valueLabel ?? 'value',
    builtAt,
    items: all.length,
    newest: all.reduce<string | null>(
      (newest, item) => (!newest || item.updatedAt > newest ? item.updatedAt : newest),
      null,
    ),
    companies: {
      total: all.length,
      withValues: all.filter((item) => item.values?.length).length,
      withoutValues: all.filter((item) => item.status === 'empty').length,
      errors: all.filter((item) => item.status === 'error').length,
    },
    batches: tally(all, (item) => item.batch || undefined),
    industries: tally(all, (item) =>
      typeof item.sourceData?.industry === 'string' ? (item.sourceData.industry as string) : undefined,
    ),
    values: entries.map((entry) => [entry.value, entry.count, entry.key]),
    aliases: Object.fromEntries(
      entries.filter((entry) => entry.aliases.length).map((entry) => [entry.key, entry.aliases]),
    ),
    companyIndex: all
      .filter((item) => item.values?.length)
      .map((item) => [item.slug, item.name, item.batch, item.values.length] as [string, string, string, number]),
    omitted: 0,
  }

  // The catalog grows with the number of distinct values, and a KV value over
  // ~128KB is rejected outright. Drop the least-used tail rather than failing
  // the write, and say how many went. The company list gives way only after
  // the values do, since it is what turns a company name into a slug.
  const trim = (list: unknown[], count: () => void) => {
    while (list.length && JSON.stringify(catalog).length > MAX_VALUE_BYTES) {
      list.splice(-Math.max(1, Math.ceil(list.length * 0.05)))
      count()
    }
  }
  const before = catalog.values.length
  trim(catalog.values, () => undefined)
  catalog.omitted = before - catalog.values.length
  trim(catalog.companyIndex, () => undefined)

  return { entries, catalog }
}

/** Drop a collection's index — used when the collection itself is deleted. */
export async function clearIndex(collection: string): Promise<void> {
  const keys = await indexedKeys(collection)
  await mapLimit(keys, 24, (key) => vendors().delete(key))
  await catalogs().delete(collection)
}
