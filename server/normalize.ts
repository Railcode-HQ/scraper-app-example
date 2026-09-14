/**
 * How a raw extracted value folds into the one thing it names.
 *
 * Subprocessor pages spell the same vendor every way there is — "Stripe",
 * "Stripe, Inc.", "stripe.com" — and both the collection page and the reverse
 * index behind the Slack agent have to collapse them. They have to collapse
 * them the SAME way, or the app and Slack quietly report different counts for
 * the same question. So the rule lives here, imported by both, and nothing in
 * this file may reach for the SDK or the DOM.
 */

/**
 * Legal suffixes, stripped from the end only. Anchoring matters: a global
 * match on "co" or "company" eats words out of the middle of real names.
 */
const LEGAL =
  /[,\s]+(inc|incorporated|llc|l\.?l\.?c|ltd|limited|gmbh|corp|corporation|company|co|pbc|s\.?a|a\.?g|b\.?v|n\.?v|s\.?r\.?l|sarl|srl|plc|pty|pte|ab|oy|as|kk|ug)\.?$/i

/** A name written as a hostname: "sentry.io", "cloud.google.com". */
const HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

export interface Normalized {
  /** The grouping key: lowercase, punctuation folded to single spaces. */
  key: string
  /** The name with the noise removed, in its original casing. */
  display: string
  /** A trailing parenthetical, kept as a hint and never used to group. */
  alias: string | null
}

function fold(raw: string): Normalized {
  let display = raw.trim()
  let alias: string | null = null

  // A trailing parenthetical is either a shorthand ("Amazon Web Services
  // (AWS)") or the parent legal entity ("Google Analytics (Google LLC)"), and
  // nothing in the string says which. Grouping on it folded every Google
  // product into Google Analytics, so only the base name decides the group.
  // That leaves "AWS" and "Amazon Web Services" as separate rows on purpose —
  // both are visible with their counts, and calling them one vendor is a
  // judgement the reader makes.
  const parenthetical = display.match(/^(.*?)\s*\(([^)]{1,60})\)\s*$/)
  if (parenthetical && parenthetical[1].trim()) {
    display = parenthetical[1].trim()
    alias = parenthetical[2].trim()
  }

  // "Foo, Inc. Ltd." — strip until nothing more comes off.
  let previous: string
  do {
    previous = display
    display = display.replace(LEGAL, '').trim()
  } while (display !== previous)

  // Some pages list domains rather than names, so "stripe.com" and "Stripe"
  // arrive as two vendors. Reduce a bare hostname to the label before its TLD.
  const lower = display.toLowerCase()
  if (HOSTNAME.test(lower)) {
    const labels = lower.replace(/^www\./, '').split('.')
    const label = labels.length > 1 ? labels[labels.length - 2] : labels[0]
    return { key: label, display, alias }
  }

  return { key: lower.replace(/[^a-z0-9]+/g, ' ').trim(), display, alias }
}

/**
 * Memoised: a few hundred vendor names recur across every company, and the
 * collection page folds every one of them on each render. The cap keeps a
 * long-lived worker from growing a cache without end.
 */
const cache = new Map<string, Normalized>()

export function normalize(raw: string): Normalized {
  const hit = cache.get(raw)
  if (hit) return hit
  const result = fold(raw)
  if (cache.size > 20_000) cache.clear()
  cache.set(raw, result)
  return result
}

/** The grouping key alone — what the collection page asks for. */
export const normalizeKey = (raw: string): string => normalize(raw).key
