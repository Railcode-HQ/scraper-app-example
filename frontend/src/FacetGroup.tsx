import { useMemo, useState } from 'react'
import { Icon } from './ui'

// The facet primitives, shared by the YC source rail and the collection rail.
// Both filter lists of things by counted values, so they get the same controls.

export type Entry = [string, number]

export const byCount = (a: Entry, b: Entry) => b[1] - a[1] || a[0].localeCompare(b[0])

export function Option({
  label,
  count,
  on,
  round,
  onClick,
}: {
  label: string
  count?: number
  on: boolean
  round?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={on ? 'opt on' : 'opt'}
      onClick={onClick}
      aria-pressed={on}
      title={label}
    >
      <span className={round ? 'box round' : 'box'} aria-hidden="true">
        <Icon name="check" />
      </span>
      <span className="txt">{label}</span>
      {count !== undefined && <span className="n">{count.toLocaleString('en-US')}</span>}
    </button>
  )
}

/**
 * One facet. Selected values are hoisted to the top so a refinement is never
 * hidden behind "Show all", and counts stay live because they're computed with
 * this facet's own selection removed.
 */
export function FacetGroup({
  title,
  counts,
  selected,
  onToggle,
  sort = byCount,
  initial = 8,
  searchable = false,
  hideEmpty = true,
}: {
  title: string
  counts?: Record<string, number>
  selected: string[]
  onToggle: (value: string) => void
  sort?: (a: Entry, b: Entry) => number
  initial?: number
  searchable?: boolean
  hideEmpty?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [find, setFind] = useState('')

  const ordered = useMemo(() => {
    const map = new Map<string, number>(Object.entries(counts ?? {}))
    if (hideEmpty) for (const [value, count] of map) if (!count) map.delete(value)
    // A chosen value that the current refinement zeroes out must still render.
    for (const value of selected) if (!map.has(value)) map.set(value, 0)
    const all = [...map.entries()].sort(sort)
    const chosen = all.filter(([v]) => selected.includes(v))
    return [...chosen, ...all.filter(([v]) => !selected.includes(v))]
  }, [counts, selected, sort, hideEmpty])

  const matching = useMemo(() => {
    const needle = find.trim().toLowerCase()
    if (!needle) return ordered
    return ordered.filter(([v]) => v.toLowerCase().includes(needle))
  }, [ordered, find])

  if (!ordered.length) return null

  const visible = expanded ? matching : ordered.slice(0, initial)
  const overflow = ordered.length - initial

  return (
    <section>
      <div className="eyebrow">
        <span>{title}</span>
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => {
              setExpanded((v) => !v)
              setFind('')
            }}
          >
            {expanded ? 'Show less' : `Show all ${ordered.length}`}
          </button>
        )}
      </div>
      {expanded && searchable && (
        <input
          className="ffind"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder={`Find in ${title.toLowerCase()}…`}
          aria-label={`Find in ${title}`}
        />
      )}
      <div className="opts">
        {visible.map(([value, count]) => (
          <Option
            key={value}
            label={value}
            count={count}
            on={selected.includes(value)}
            onClick={() => onToggle(value)}
          />
        ))}
        {expanded && !visible.length && (
          <span style={{ padding: '6px 8px', color: 'var(--faint)' }}>No match.</span>
        )}
      </div>
    </section>
  )
}
