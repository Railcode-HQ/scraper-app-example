import { ctx, db } from '@railcode/sdk'
import { answer } from './exa'
import type { Target } from './yc'

// A source you fill yourself: paste a website, Exa reads it, and the company
// joins the app on the same footing as one from YC — filterable, bookmarkable,
// and a valid target for any workflow.

export interface CustomCompany {
  slug: string
  name: string
  description: string
  website: string
  /** Exactly what was pasted, kept so a bad extraction is traceable. */
  url: string
  /** Why this company is here — written by hand, never by the extractor. */
  note: string
  addedAt: string
  addedBy: string
  costUsd: number
}

const companies = () => db.collection<CustomCompany>('custom_companies')

const SCHEMA = {
  type: 'object',
  required: ['name', 'description', 'website'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: 'The company name' },
    description: {
      type: 'string',
      description: 'One short sentence describing what the company does',
    },
    website: { type: 'string', description: 'The primary website URL, including https://' },
  },
} as const

interface Extracted {
  name?: unknown
  description?: unknown
  website?: unknown
}

/**
 * A company is its domain: two URLs on the same host are the same company, so
 * the host is the identity and re-pasting is free rather than a duplicate.
 */
function identify(raw: string): { url: string; host: string; slug: string } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!url.hostname.includes('.')) return null
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    const slug = host.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    if (!slug) return null
    return { url: url.toString(), host, slug }
  } catch {
    return null
  }
}

const text = (value: unknown, cap: number): string =>
  typeof value === 'string' ? value.trim().slice(0, cap) : ''

/** Long enough for a paragraph of provenance, short enough to stay a note. */
export const NOTE_CAP = 2000

export const cleanNote = (value: unknown): string => text(value, NOTE_CAP)

/**
 * Notes accumulate rather than overwrite: finding the same company by a second
 * route is more context, not a correction. Re-adding a note it already carries
 * is a no-op, so pasting the same batch twice doesn't double it.
 */
function mergeNote(existing: string, addition: string): string {
  if (!addition || !existing) return addition || existing
  if (existing.split('\n').some((line) => line.trim() === addition)) return existing
  return `${existing}\n${addition}`.slice(0, NOTE_CAP)
}

/** Records written before notes existed have no `note` key. Read them as blank. */
const shape = (company: CustomCompany): CustomCompany => ({
  ...company,
  note: cleanNote(company.note),
})

/** Split a paste — newlines, commas, or whitespace — into candidate URLs. */
export function splitUrls(input: string): string[] {
  return [...new Set(input.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))]
}

export interface AddResult {
  added: CustomCompany[]
  skipped: CustomCompany[]
  failed: { url: string; error: string }[]
}

type Outcome =
  | { kind: 'added'; company: CustomCompany }
  | { kind: 'skipped'; company: CustomCompany }
  | { kind: 'failed'; failure: { url: string; error: string } }

/**
 * `note` is the context for this whole paste — how you got to these companies.
 * It lands on each one added, and is folded into the note of any already here.
 */
export async function add(urls: string[], rawNote = ''): Promise<AddResult> {
  const result: AddResult = { added: [], skipped: [], failed: [] }
  const note = cleanNote(rawNote)

  const outcomes: Outcome[] = await Promise.all(
    urls.map(async (raw): Promise<Outcome> => {
      const id = identify(raw)
      if (!id) return { kind: 'failed', failure: { url: raw, error: 'not a valid website URL' } }

      // Already known? Don't pay Exa again for a re-paste — but a note that
      // came with it is new context, so keep that.
      const existing = await companies().get(id.slug).catch(() => null)
      if (existing) {
        const merged = mergeNote(cleanNote(existing.note), note)
        if (merged === cleanNote(existing.note)) return { kind: 'skipped', company: shape(existing) }
        const updated = { ...shape(existing), note: merged }
        await companies().put(id.slug, updated)
        return { kind: 'skipped', company: updated }
      }

      try {
        const { data, costUsd } = await answer<Extracted>(
          `What company is at ${id.url}? Give its company name, a one-sentence description of ` +
            `what it does, and its primary website URL.`,
          SCHEMA as unknown as Record<string, unknown>,
        )
        const company: CustomCompany = {
          slug: id.slug,
          name: text(data?.name, 120) || id.host,
          description: text(data?.description, 300),
          website: text(data?.website, 300) || `https://${id.host}`,
          url: id.url,
          note,
          addedAt: new Date().toISOString(),
          addedBy: ctx.user?.name ?? ctx.user?.email ?? 'someone',
          costUsd,
        }
        await companies().put(id.slug, company)
        return { kind: 'added', company }
      } catch (err) {
        return {
          kind: 'failed',
          failure: {
            url: raw,
            error: err instanceof Error ? err.message.slice(0, 200) : 'failed',
          },
        }
      }
    }),
  )

  for (const outcome of outcomes) {
    if (outcome.kind === 'added') result.added.push(outcome.company)
    else if (outcome.kind === 'skipped') result.skipped.push(outcome.company)
    else result.failed.push(outcome.failure)
  }
  return result
}

const PAGE = 200

export async function list(): Promise<CustomCompany[]> {
  const out: CustomCompany[] = []
  for (let page = 1; page <= 25; page++) {
    const rows = await companies().query().orderBy('addedAt', 'desc').page(page, PAGE)
    out.push(...rows.map((r) => shape(r.value)))
    if (rows.length < PAGE) break
  }
  return out
}

export const remove = (slug: string) => companies().delete(slug)

/** The explicit way to change a note: replaces it outright, blank to clear. */
export async function setNote(slug: string, rawNote: unknown): Promise<CustomCompany | null> {
  const existing = await companies().get(slug).catch(() => null)
  if (!existing) return null
  const updated = { ...shape(existing), note: cleanNote(rawNote) }
  await companies().put(slug, updated)
  return updated
}

/** This source's half of the run contract — same shape YC returns. */
export async function collectTargets(
  filters: { q?: unknown },
  limit: number,
): Promise<Target[]> {
  const needle = typeof filters.q === 'string' ? filters.q.trim().toLowerCase() : ''
  const all = await list()
  const matched = needle
    ? all.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.description.toLowerCase().includes(needle) ||
          c.note.toLowerCase().includes(needle) ||
          c.slug.includes(needle),
      )
    : all
  return matched.slice(0, limit).map((company) => ({
    slug: company.slug,
    name: company.name,
    website: company.website,
    batch: '',
    data: {
      description: company.description,
      website: company.website,
      note: company.note,
      added_by: company.addedBy,
    },
  }))
}
