import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Option, byCount, type Entry } from './FacetGroup'
import { Icon } from './ui'

// Filters live above the list they filter, as a row of dropdowns. Each button
// carries its own selection, so the bar reads as a sentence about what you're
// looking at without needing a separate row of chips.

/**
 * Open/close plus dismiss-on-outside-click and Escape. Shared so every popover
 * in the app closes the same way, whatever its trigger looks like.
 */
export function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return { open, setOpen, ref }
}

/** The button + popover shell. Everything else here fills in the body. */
function Menu({
  label,
  summary,
  active,
  children,
}: {
  label: string
  summary: string
  active: boolean
  children: ReactNode
}) {
  const { open, setOpen, ref } = usePopover()

  return (
    <div className="menuwrap" ref={ref}>
      <button
        type="button"
        className={active ? 'fbtn on' : 'fbtn'}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="flabel">{label}</span>
        {summary && <span className="fval">{summary}</span>}
        <Icon name="caretdown" />
      </button>
      {open && <div className="menu">{children}</div>}
    </div>
  )
}

function summarize(selected: string[], format?: (value: string) => string): string {
  if (!selected.length) return ''
  if (selected.length === 1) return format ? format(selected[0]) : selected[0]
  return `${selected.length} selected`
}

function MenuHead({ label, onClear }: { label: string; onClear?: () => void }) {
  return (
    <div className="menuhead">
      <span>{label}</span>
      {onClear && (
        <button type="button" onClick={onClear}>
          Clear
        </button>
      )}
    </div>
  )
}

/** A facet: many values, multi-select, counted. */
export function FacetMenu({
  label,
  counts,
  selected,
  onChange,
  sort = byCount,
  searchable = false,
  format,
  hideEmpty = true,
}: {
  label: string
  counts?: Record<string, number>
  selected: string[]
  onChange: (next: string[]) => void
  sort?: (a: Entry, b: Entry) => number
  searchable?: boolean
  format?: (value: string) => string
  hideEmpty?: boolean
}) {
  const [find, setFind] = useState('')

  const ordered = useMemo(() => {
    const map = new Map<string, number>(Object.entries(counts ?? {}))
    if (hideEmpty) for (const [value, count] of map) if (!count) map.delete(value)
    for (const value of selected) if (!map.has(value)) map.set(value, 0)
    const all = [...map.entries()].sort(sort)
    const chosen = all.filter(([v]) => selected.includes(v))
    return [...chosen, ...all.filter(([v]) => !selected.includes(v))]
  }, [counts, selected, sort, hideEmpty])

  const visible = useMemo(() => {
    const needle = find.trim().toLowerCase()
    if (!needle) return ordered
    return ordered.filter(([v]) => (format ? format(v) : v).toLowerCase().includes(needle))
  }, [ordered, find, format])

  if (!ordered.length) return null

  return (
    <Menu
      label={label}
      summary={summarize(selected, format)}
      active={selected.length > 0}
    >
      <MenuHead label={label} onClear={selected.length ? () => onChange([]) : undefined} />
      {searchable && ordered.length > 8 && (
        <input
          className="ffind"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder={`Find in ${label.toLowerCase()}…`}
          aria-label={`Find in ${label}`}
          autoFocus
        />
      )}
      <div className="menulist">
        {visible.map(([value, count]) => (
          <Option
            key={value}
            label={format ? format(value) : value}
            count={count}
            on={selected.includes(value)}
            onClick={() =>
              onChange(
                selected.includes(value)
                  ? selected.filter((v) => v !== value)
                  : [...selected, value],
              )
            }
          />
        ))}
        {!visible.length && <span className="menuempty">No match.</span>}
      </div>
    </Menu>
  )
}

/** A facet where only one value makes sense — company size, source. */
export function SingleMenu({
  label,
  options,
  counts,
  selected,
  onChange,
}: {
  label: string
  options: { id: string; label: string }[]
  counts?: Record<string, number>
  selected: string | null
  onChange: (next: string | null) => void
}) {
  const current = options.find((o) => o.id === selected)
  return (
    <Menu label={label} summary={current?.label ?? ''} active={!!current}>
      <MenuHead label={label} onClear={current ? () => onChange(null) : undefined} />
      <div className="menulist">
        {options.map((option) => (
          <Option
            key={option.id}
            label={option.label}
            count={counts?.[option.id]}
            on={selected === option.id}
            round
            onClick={() => onChange(selected === option.id ? null : option.id)}
          />
        ))}
      </div>
    </Menu>
  )
}

/** A group of independent booleans behind one button. */
export function TogglesMenu({
  label,
  options,
  counts,
  selected,
  onChange,
}: {
  label: string
  options: { id: string; label: string }[]
  counts?: Record<string, number | undefined>
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const chosen = options.filter((o) => selected.includes(o.id))
  return (
    <Menu
      label={label}
      summary={chosen.length === 1 ? chosen[0].label : chosen.length ? `${chosen.length} on` : ''}
      active={chosen.length > 0}
    >
      <MenuHead label={label} onClear={chosen.length ? () => onChange([]) : undefined} />
      <div className="menulist">
        {options.map((option) => (
          <Option
            key={option.id}
            label={option.label}
            count={counts?.[option.id]}
            on={selected.includes(option.id)}
            onClick={() =>
              onChange(
                selected.includes(option.id)
                  ? selected.filter((v) => v !== option.id)
                  : [...selected, option.id],
              )
            }
          />
        ))}
      </div>
    </Menu>
  )
}

/** Wraps a bar and appends the global escape hatch. */
export function FilterBar({
  children,
  active,
  onReset,
}: {
  children: ReactNode
  active: number
  onReset: () => void
}) {
  return (
    <div className="filterbar">
      {children}
      {active > 0 && (
        <button type="button" className="fclear" onClick={onReset}>
          Clear all
          <span className="n">{active}</span>
        </button>
      )}
    </div>
  )
}

export { Menu, MenuHead }
