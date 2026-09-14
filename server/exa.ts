import { connector } from '@railcode/sdk'

// Exa is reached through the org's service connector, so the key stays with the
// platform and never enters this app. Every call reports its own cost, which the
// run ledger accumulates.

export class ProviderError extends Error {}

interface AnswerResponse {
  answer?: unknown
  citations?: { title?: string | null; url?: string | null }[]
  costDollars?: { total?: number }
}

export interface Citation {
  title: string
  url: string
}

/**
 * `/answer` with an `outputSchema` is the useful shape here: Exa does the
 * searching, reading, and extraction in one grounded call and hands back JSON
 * matching the schema, plus the sources it used.
 */
export async function answer<T>(
  query: string,
  outputSchema: Record<string, unknown>,
): Promise<{ data: T | null; citations: Citation[]; costUsd: number }> {
  const res = await connector('exa').fetch('/answer', {
    method: 'POST',
    body: JSON.stringify({ query, outputSchema }),
  })
  const text = await res.text()
  if (!res.ok) throw new ProviderError(`Exa /answer → HTTP ${res.status}: ${text.slice(0, 200)}`)

  let parsed: AnswerResponse
  try {
    parsed = JSON.parse(text) as AnswerResponse
  } catch {
    throw new ProviderError('Exa /answer returned a non-JSON body')
  }

  // With outputSchema set the answer is already an object, but Exa sometimes
  // hands back the JSON as a string — accept both rather than lose the result.
  let data: unknown = parsed.answer
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      data = null
    }
  }

  const citations: Citation[] = (parsed.citations ?? [])
    .filter((c): c is { title?: string | null; url: string } => typeof c?.url === 'string')
    .map((c) => ({ title: c.title?.trim() || c.url, url: c.url }))

  return {
    data: (data ?? null) as T | null,
    citations,
    costUsd: parsed.costDollars?.total ?? 0,
  }
}
