import { answer } from './exa'
import type { Target } from './yc'

// A workflow turns one company into one collection row. Adding a second one is
// a matter of appending to WORKFLOWS — the runner, the run UI, and the
// collection plumbing are all generic over this interface.

export interface WorkflowResult {
  /** The values that define the row — what the collection is searched by. */
  values: string[]
  /** Whatever extra structure the workflow wants to keep alongside them. */
  detail: Record<string, unknown>[]
  citations: { title: string; url: string }[]
  costUsd: number
}

export interface Workflow {
  id: string
  label: string
  description: string
  /** The collection rows land in. */
  collection: string
  collectionLabel: string
  /** Noun for one extracted value, used in the collection UI. */
  valueLabel: string
  /** Rough per-company cost, for the pre-flight estimate. */
  costPerCompany: number
  run(target: Target): Promise<WorkflowResult>
}

// ── subprocessors ────────────────────────────────────────────────────────────

const SUBPROCESSOR_SCHEMA = {
  type: 'object',
  required: ['subprocessors'],
  additionalProperties: false,
  properties: {
    subprocessors: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: 'The vendor name exactly as published' },
          purpose: { type: 'string', description: 'What the vendor is used for, if stated' },
        },
      },
    },
  },
} as const

interface SubprocessorAnswer {
  subprocessors?: { name?: unknown; purpose?: unknown }[]
}

function hostOf(website: string | null): string | null {
  if (!website) return null
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.replace(
      /^www\./,
      '',
    )
  } catch {
    return null
  }
}

/**
 * Exa's structured output occasionally spills raw JSON into a string field
 * ('Foo Ltd"}},{"name":{"citations":[2]…'). One bad row poisons the whole
 * breakdown, so anything that looks like escaped JSON is dropped rather than
 * stored. Vendor names are short; that alone rules most of it out.
 */
function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim()
  if (!name || name.length > 80) return null
  if (/[{}[\]]|"\s*:/.test(name)) return null
  return name
}

const subprocessors: Workflow = {
  id: 'subprocessors',
  label: 'Extract subprocessors',
  description:
    'Finds the third-party vendors each company names on its public subprocessors, DPA, or trust page.',
  collection: 'subprocessors',
  collectionLabel: 'Subprocessors',
  valueLabel: 'subprocessor',
  costPerCompany: 0.005,

  async run(target: Target): Promise<WorkflowResult> {
    const host = hostOf(target.website)
    // Naming the domain matters: plenty of YC companies share a name with a
    // larger unrelated company, and the domain is what disambiguates them.
    const subject = host ? `${target.name} (${host})` : target.name
    const query =
      `What subprocessors does ${subject} use? ` +
      `List every third-party subprocessor or vendor named on their public subprocessors page, ` +
      `DPA, trust centre, or privacy policy. Only include vendors for this exact company. ` +
      `Give each vendor's company name (e.g. "Stripe"), not its domain or product URL. ` +
      `Return an empty list if this company does not publish a subprocessor list.`

    const { data, citations, costUsd } = await answer<SubprocessorAnswer>(
      query,
      SUBPROCESSOR_SCHEMA as unknown as Record<string, unknown>,
    )

    const seen = new Set<string>()
    const detail: Record<string, unknown>[] = []
    const values: string[] = []

    for (const entry of data?.subprocessors ?? []) {
      const name = cleanName(entry?.name)
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      values.push(name)
      const purpose = typeof entry?.purpose === 'string' ? entry.purpose.trim() : ''
      detail.push(purpose ? { name, purpose } : { name })
    }

    return { values, detail, citations, costUsd }
  },
}

export const WORKFLOWS: Workflow[] = [subprocessors]

export const getWorkflow = (id: string): Workflow | undefined =>
  WORKFLOWS.find((w) => w.id === id)

export const getWorkflowByCollection = (collection: string): Workflow | undefined =>
  WORKFLOWS.find((w) => w.collection === collection)
