import { useMemo, useState } from 'react'
import { FacetMenu, FilterBar, Menu, MenuHead, SingleMenu, TogglesMenu } from '../FilterMenu'
import { Option, byCount, type Entry } from '../FacetGroup'
import { Icon } from '../ui'
import {
  EMPTY,
  FACET_LABEL,
  SIZE_BUCKETS,
  STATUS_ORDER,
  TOGGLE_OPTIONS,
  activeCount,
  batchRank,
  toggleValue,
  type Disjunctive,
  type FilterState,
} from '../filters'
import type { FacetCounts } from '../types'

const subLabel = (value: string) =>
  value.includes(' -> ') ? value.slice(value.indexOf(' -> ') + 4) : value

/**
 * Industry is two levels on YC, and the tree is the only thing that makes the
 * sub-industries legible — so it keeps its shape inside the popover rather than
 * flattening into a list of "B2B -> Analytics" strings.
 */
function IndustryMenu({
  facets,
  state,
  onToggle,
  onClear,
}: {
  facets: FacetCounts
  state: FilterState
  onToggle: (facet: Disjunctive, value: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState<string[]>([])

  const industries = useMemo(() => {
    const map = new Map<string, number>(Object.entries(facets.industry ?? {}))
    for (const value of state.selected.industry) if (!map.has(value)) map.set(value, 0)
    return [...map.entries()].sort(byCount)
  }, [facets.industry, state.selected.industry])

  const children = useMemo(() => {
    const grouped = new Map<string, Entry[]>()
    for (const [key, count] of Object.entries(facets.subindustry ?? {})) {
      const split = key.indexOf(' -> ')
      if (split < 0) continue
      const parent = key.slice(0, split)
      const list = grouped.get(parent) ?? []
      list.push([key, count])
      grouped.set(parent, list)
    }
    for (const list of grouped.values()) list.sort(byCount)
    return grouped
  }, [facets.subindustry])

  const chosen = [...state.selected.industry, ...state.selected.subindustry.map(subLabel)]
  if (!industries.length) return null

  return (
    <Menu
      label="Industry"
      summary={chosen.length === 1 ? chosen[0] : chosen.length ? `${chosen.length} selected` : ''}
      active={chosen.length > 0}
    >
      <MenuHead label="Industry" onClear={chosen.length ? onClear : undefined} />
      <div className="menulist">
        {industries.map(([industry, count]) => {
          const subs = children.get(industry) ?? []
          const isOpen = open.includes(industry)
          return (
            <div key={industry}>
              <div className="optrow">
                <Option
                  label={industry}
                  count={count}
                  on={state.selected.industry.includes(industry)}
                  onClick={() => onToggle('industry', industry)}
                />
                {subs.length > 0 && (
                  <button
                    type="button"
                    className={isOpen ? 'caret open' : 'caret'}
                    onClick={() => setOpen((v) => toggleValue(v, industry))}
                    aria-label={`${isOpen ? 'Hide' : 'Show'} ${industry} sub-industries`}
                    aria-expanded={isOpen}
                  >
                    <Icon name="chevron" />
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="sub">
                  {subs.map(([key, subCount]) => (
                    <Option
                      key={key}
                      label={subLabel(key)}
                      count={subCount}
                      on={state.selected.subindustry.includes(key)}
                      onClick={() => onToggle('subindustry', key)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Menu>
  )
}

/** The live YC index filters — counts come from Algolia, not from local rows. */
export default function YcFilterBar({
  facets,
  state,
  onChange,
}: {
  facets: FacetCounts
  state: FilterState
  onChange: (next: FilterState) => void
}) {
  const set = (facet: Disjunctive, values: string[]) =>
    onChange({ ...state, selected: { ...state.selected, [facet]: values } })

  const toggleFacet = (facet: Disjunctive, value: string) =>
    set(facet, toggleValue(state.selected[facet], value))

  const sortBatch = (a: Entry, b: Entry) => batchRank(b[0]) - batchRank(a[0])
  const sortStatus = (a: Entry, b: Entry) =>
    (STATUS_ORDER.indexOf(a[0]) + 1 || 99) - (STATUS_ORDER.indexOf(b[0]) + 1 || 99)

  return (
    <FilterBar
      active={activeCount(state)}
      onReset={() => onChange({ ...EMPTY, q: state.q, sort: state.sort })}
    >
      <FacetMenu
        label={FACET_LABEL.batch}
        counts={facets.batch}
        selected={state.selected.batch}
        onChange={(v) => set('batch', v)}
        sort={sortBatch}
        searchable
      />

      <IndustryMenu
        facets={facets}
        state={state}
        onToggle={toggleFacet}
        onClear={() => onChange({ ...state, selected: { ...state.selected, industry: [], subindustry: [] } })}
      />

      <FacetMenu
        label={FACET_LABEL.tags}
        counts={facets.tags}
        selected={state.selected.tags}
        onChange={(v) => set('tags', v)}
        searchable
      />

      <FacetMenu
        label={FACET_LABEL.regions}
        counts={facets.regions}
        selected={state.selected.regions}
        onChange={(v) => set('regions', v)}
        searchable
      />

      <SingleMenu
        label="Size"
        options={SIZE_BUCKETS.map((b) => ({ id: b.id, label: b.label }))}
        selected={state.size}
        onChange={(size) => onChange({ ...state, size })}
      />

      <FacetMenu
        label={FACET_LABEL.status}
        counts={facets.status}
        selected={state.selected.status}
        onChange={(v) => set('status', v)}
        sort={sortStatus}
      />

      <TogglesMenu
        label="More"
        options={TOGGLE_OPTIONS}
        counts={Object.fromEntries(TOGGLE_OPTIONS.map((o) => [o.id, facets[o.id]?.true]))}
        selected={state.toggles}
        onChange={(toggles) => onChange({ ...state, toggles })}
      />
    </FilterBar>
  )
}
