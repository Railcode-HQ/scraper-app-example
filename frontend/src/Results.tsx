import { useEffect, useRef, type RefObject } from 'react'
import { Icon, Logo, StatusBadge, fmt } from './ui'
import BookmarkMenu from './BookmarkMenu'
import { fromCompany } from './bookmarks'
import type { BookmarkList, Company, Membership, SearchResponse } from './types'

function CompanyRow({
  company,
  onOpen,
  lists,
  membership,
  onBookmarked,
}: {
  company: Company
  onOpen: () => void
  lists: BookmarkList[]
  membership: Membership
  onBookmarked: () => void
}) {
  const tags = company.tags.slice(0, 3)
  return (
    <div className="row">
      <button type="button" className="rowmain" onClick={onOpen}>
        <Logo src={company.small_logo_thumb_url} name={company.name} />

      <div className="rowbody">
        <div className="rowtop">
          <h3>{company.name}</h3>
          {company.top_company && (
            <span className="badge t-amber" title="YC top company">
              <Icon name="star" fill />
              Top
            </span>
          )}
          <StatusBadge status={company.status} />
          {company.isHiring && <span className="badge t-green">Hiring</span>}
          {company.nonprofit && <span className="badge t-violet">Nonprofit</span>}
        </div>

        {company.one_liner && <p className="oneliner">{company.one_liner}</p>}

        <div className="meta">
          {company.all_locations && <span>{company.all_locations}</span>}
          {company.all_locations && company.team_size ? <span className="dot" /> : null}
          {company.team_size ? <span className="tab">{fmt.format(company.team_size)} people</span> : null}
        </div>
      </div>
      </button>

      <div className="rowtags">
        {company.batch && company.batch !== 'Unspecified' && (
          <span className="badge t-accent">{company.batch}</span>
        )}
        {tags.map((tag) => (
          <span key={tag} className="badge t-dim">
            {tag}
          </span>
        ))}
      </div>

      <BookmarkMenu
        targets={[fromCompany(company)]}
        lists={lists}
        membership={membership}
        onChanged={onBookmarked}
        compact
      />
    </div>
  )
}

export default function Results({
  hits,
  meta,
  loading,
  loadingMore,
  error,
  onOpen,
  onLoadMore,
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
  onOpen: (company: Company) => void
  onLoadMore: () => void
  scrollRef: RefObject<HTMLDivElement | null>
  lists: BookmarkList[]
  membership: Membership
  onBookmarked: () => void
}) {
  const sentinel = useRef<HTMLDivElement | null>(null)
  const hasMore = !!meta && meta.page + 1 < meta.nbPages

  // Infinite scroll, observed inside the panel's own scroll region rather than
  // the viewport — the page itself never scrolls in this shell.
  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasMore || loading) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore()
      },
      { root: scrollRef.current ?? null, rootMargin: '600px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, onLoadMore, scrollRef])

  if (error) {
    return (
      <div className="banner">
        <Icon name="alert" />
        <div>
          <strong>Couldn’t reach the directory.</strong>
          <div style={{ marginTop: 2 }}>{error}</div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="centered">
        <div className="spinner" />
        <p>Searching…</p>
      </div>
    )
  }

  if (!hits.length) {
    return (
      <div className="centered">
        <Icon name="empty" />
        <h3>No companies match</h3>
        <p>Try removing a filter or searching for something broader.</p>
      </div>
    )
  }

  return (
    <>
      <div className="list">
        {hits.map((company) => (
          <CompanyRow
            key={company.objectID}
            company={company}
            onOpen={() => onOpen(company)}
            lists={lists}
            membership={membership}
            onBookmarked={onBookmarked}
          />
        ))}
      </div>

      <div className="sentinel" ref={sentinel}>
        {loadingMore ? (
          <>
            <div className="spinner" />
            <span>Loading more…</span>
          </>
        ) : hasMore ? (
          <button type="button" className="btn ghost sm" onClick={onLoadMore}>
            Load more
          </button>
        ) : (
          <span>
            {meta && meta.nbHits > meta.reachable
              ? `End of the first ${fmt.format(meta.reachable)} results — narrow the filters to reach the rest.`
              : `${fmt.format(hits.length)} compan${hits.length === 1 ? 'y' : 'ies'} — that’s all of them.`}
          </span>
        )}
      </div>
    </>
  )
}
