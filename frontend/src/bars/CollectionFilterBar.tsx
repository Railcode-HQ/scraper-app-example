import { FacetMenu, FilterBar, SingleMenu, TogglesMenu } from '../FilterMenu'
import { SIZE_BUCKETS } from '../filters'
import {
  EMPTY_FILTER,
  RESULT_STATUS,
  SOURCES,
  activeCount,
  sorterFor,
  type CollectionFilter,
  type Counts,
  type SourceDef,
} from '../sources'

const subLabel = (value: string) =>
  value.includes(' -> ') ? value.slice(value.indexOf(' -> ') + 4) : value

/**
 * Filters over collected rows rather than a live index. Source comes first and
 * is single-select on purpose: a row belongs to exactly one source, and picking
 * one is what reveals that source's axes. Adding a second source changes this
 * bar's shape on its own.
 */
export default function CollectionFilterBar({
  state,
  counts,
  source,
  onChange,
}: {
  state: CollectionFilter
  counts: Counts
  source: SourceDef | null
  onChange: (next: CollectionFilter) => void
}) {
  const present = SOURCES.filter((s) => (counts.sources[s.id] ?? 0) > 0 || state.source === s.id)

  return (
    <FilterBar active={activeCount(state)} onReset={() => onChange(EMPTY_FILTER)}>
      <SingleMenu
        label="Source"
        options={present.map((s) => ({ id: s.id, label: s.label }))}
        counts={counts.sources}
        selected={state.source}
        // Dropping the source drops its axes with it — they mean nothing alone.
        onChange={(next) => onChange({ ...state, source: next, values: {}, toggles: [], size: null })}
      />

      <FacetMenu
        label="Result"
        counts={counts.status}
        selected={state.status}
        onChange={(status) => onChange({ ...state, status })}
        sort={(a, b) =>
          RESULT_STATUS.findIndex((r) => r.id === a[0]) - RESULT_STATUS.findIndex((r) => r.id === b[0])
        }
        format={(id) => RESULT_STATUS.find((r) => r.id === id)?.label ?? id}
        hideEmpty={false}
      />

      {/* Source-specific axes, revealed only once a source is chosen. */}
      {source && (
        <>
          <span className="fsep" aria-hidden="true" />

          {source.facets.map((facet) => (
            <FacetMenu
              key={facet.key}
              label={facet.label}
              counts={counts.facets[facet.key]}
              selected={state.values[facet.key] ?? []}
              onChange={(values) =>
                onChange({ ...state, values: { ...state.values, [facet.key]: values } })
              }
              sort={sorterFor(facet)}
              searchable={facet.searchable}
              format={facet.key === 'subindustry' ? subLabel : undefined}
            />
          ))}

          {source.sizeKey && (
            <SingleMenu
              label="Size"
              options={SIZE_BUCKETS.filter(
                (b) => (counts.sizes[b.id] ?? 0) > 0 || state.size === b.id,
              ).map((b) => ({ id: b.id, label: b.label }))}
              counts={counts.sizes}
              selected={state.size}
              onChange={(size) => onChange({ ...state, size })}
            />
          )}

          {source.toggles.length > 0 && (
            <TogglesMenu
              label="More"
              options={source.toggles.map((t) => ({ id: t.key, label: t.label }))}
              counts={Object.fromEntries(
                source.toggles.map((t) => [t.key, counts.facets[t.key]?.true]),
              )}
              selected={state.toggles}
              onChange={(toggles) => onChange({ ...state, toggles })}
            />
          )}
        </>
      )}
    </FilterBar>
  )
}
