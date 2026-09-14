import Results from '../Results'
import YcFilterBar from '../bars/YcFilterBar'
import { Icon, fmt } from '../ui'
import type { FilterState } from '../filters'
import type { BookmarkList, Company, FacetCounts, Membership, SearchResponse } from '../types'
import type { RefObject } from 'react'

/**
 * The Y Combinator directory. One *source* among several the app expects to
 * grow, which is why it's a view rather than the whole app.
 */
export default function Source({
  hits,
  meta,
  loading,
  loadingMore,
  error,
  facets,
  filters,
  onFilters,
  onOpen,
  onLoadMore,
  onRun,
  canRun,
  scrollRef,
  lists,
  membership,
  onBookmarked,
}: {
  hits: Company[]
  meta: SearchResponse | null
  loading: boolean
  loadingMore: boolean
  error: string | null
  facets: FacetCounts
  filters: FilterState
  onFilters: (next: FilterState) => void
  onOpen: (company: Company) => void
  onLoadMore: () => void
  onRun: () => void
  canRun: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  lists: BookmarkList[]
  membership: Membership
  onBookmarked: () => void
}) {
  return (
    <>
      <div className="page-head split">
        <div>
          <h1>Y Combinator</h1>
          <p>
            {meta
              ? `Showing ${fmt.format(hits.length)} of ${fmt.format(meta.nbHits)} ${
                  meta.nbHits === 1 ? 'company' : 'companies'
                }`
              : 'Loading the Y Combinator directory…'}
            {meta && (
              <span style={{ color: 'var(--faint)' }}>
                {' '}
                · live from YC in {meta.processingTimeMS}ms
              </span>
            )}
          </p>
        </div>
        <button type="button" className="btn" onClick={onRun} disabled={!canRun}>
          <Icon name="play" fill />
          Run workflow
        </button>
      </div>

      <YcFilterBar facets={facets} state={filters} onChange={onFilters} />

      <Results
        hits={hits}
        meta={meta}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        onOpen={onOpen}
        onLoadMore={onLoadMore}
        scrollRef={scrollRef}
        lists={lists}
        membership={membership}
        onBookmarked={onBookmarked}
      />
    </>
  )
}
