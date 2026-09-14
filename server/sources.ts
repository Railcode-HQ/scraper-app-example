import * as custom from './custom'
import * as yc from './yc'
import type { Target } from './yc'

// One place that knows which sources exist. A run names a source; this decides
// how that source turns a filter into a list of companies.

export const SOURCE_IDS = ['yc', 'custom'] as const

export const isSource = (value: string): boolean =>
  (SOURCE_IDS as readonly string[]).includes(value)

export function collectTargets(
  source: string,
  filters: Record<string, unknown>,
  limit: number,
): Promise<Target[]> {
  if (source === 'custom') return custom.collectTargets(filters, limit)
  return yc.collectTargets(filters, limit)
}
