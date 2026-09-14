import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Icon, fmt, money } from '../ui'
import { download, stamp, toCsv } from '../csv'
import CollectionFilterBar from '../bars/CollectionFilterBar'
import BookmarkMenu from '../BookmarkMenu'
import { fromItem } from '../bookmarks'
import { loadIndexStatus, rebuildIndex } from '../api'
import type { BookmarkList, Membership } from '../types'
import type { CollectionFilter, Counts, SourceDef } from '../sources'
import type { CollectionItem, CollectionSummary } from '../types'
// The same fold the reverse index uses, so a count here and a count in Slack
// are the same count.
import { normalizeKey } from '../../../server/normalize'

/**
 * Rows revealed at a time. A 1,300-company collection is ~2,000 distinct
 * vendors on one tab and 1,300 rows on the other; painting all of them — each
 * with its own chips, bar and controls — is tens of thousands of DOM nodes and
 * by far the largest cost of opening the page.
 */
const REVEAL = 60

interface Group {
  key: string
  name: string
  variants: string[]
  companies: CollectionItem[]
}

function Reveal({
  shown,
  total,
  sentinel,
}: {
  shown: number
  total: number
  sentinel: RefObject<HTMLDivElement | null>
}) {
  if (!total) return null
  return (
    <div className="sentinel" ref={sentinel}>
      {shown < total ? (
        <>
          <div className="spinner" />
          <span>
            Showing {fmt.format(shown)} of {fmt.format(total)}…
          </span>
        </>
      ) : (
        <span>
          {fmt.format(total)} row{total === 1 ? '' : 's'}
        </span>
      )}
    </div>
  )
}

export default function Collection({
  summary,
  all,
  items,
  loading,
  error,
  filter,
  counts,
  source,
  onFilter,
  activeFilters,
  onResetFilters,
  onReload,
  onClear,
  onGoToSource,
  scrollRef,
  lists,
  membership,
  onBookmarked,
}: {
  summary: CollectionSummary | null
  /** Every row in the collection — the denominator. */
  all: CollectionItem[]
  /** The rows surviving the rail's filters — everything below is built on these. */
  items: CollectionItem[]
  loading: boolean
  error: string | null
  filter: CollectionFilter
  counts: Counts
  source: SourceDef | null
  onFilter: (next: CollectionFilter) => void
  activeFilters: number
  onResetFilters: () => void
  onReload: () => void
  onClear: () => void
  onGoToSource: () => void
  scrollRef: RefObject<HTMLDivElement | null>
  lists: BookmarkList[]
  membership: Membership
  onBookmarked: () => void
}) {
  const [tab, setTab] = useState<'values' | 'companies'>('values')
  const [find, setFind] = useState('')
  const [grouped, setGrouped] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [limit, setLimit] = useState(REVEAL)
  const sentinel = useRef<HTMLDivElement | null>(null)

  const valueLabel = summary?.valueLabel ?? 'value'

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, { spellings: Map<string, number>; companies: CollectionItem[] }>()
    for (const item of items) {
      const seenHere = new Set<string>()
      for (const value of item.values) {
        const key = grouped ? normalizeKey(value) : value.toLowerCase()
        if (!key) continue
        let entry = map.get(key)
        if (!entry) {
          entry = { spellings: new Map(), companies: [] }
          map.set(key, entry)
        }
        entry.spellings.set(value, (entry.spellings.get(value) ?? 0) + 1)
        // One company counts once per group even if it lists two spellings.
        if (!seenHere.has(key)) {
          seenHere.add(key)
          entry.companies.push(item)
        }
      }
    }
    return [...map.entries()]
      .map(([key, entry]) => {
        const spellings = [...entry.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        return {
          key,
          name: spellings[0]?.[0] ?? key,
          variants: spellings.map(([s]) => s),
          companies: entry.companies,
        }
      })
      .sort((a, b) => b.companies.length - a.companies.length || a.name.localeCompare(b.name))
  }, [items, grouped])

  const needle = find.trim().toLowerCase()

  const shownGroups = useMemo(
    () =>
      needle
        ? groups.filter((g) => g.variants.some((v) => v.toLowerCase().includes(needle)))
        : groups,
    [groups, needle],
  )

  const shownCompanies = useMemo(() => {
    const rows = [...items].sort((a, b) => b.values.length - a.values.length || a.name.localeCompare(b.name))
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.values.some((v) => v.toLowerCase().includes(needle)),
    )
  }, [items, needle])

  const stats = useMemo(() => {
    const withValues = items.filter((i) => i.status === 'ok').length
    return {
      companies: items.length,
      withValues,
      empty: items.filter((i) => i.status === 'empty').length,
      failed: items.filter((i) => i.status === 'error').length,
      cost: items.reduce((sum, i) => sum + i.costUsd, 0),
    }
  }, [items])

  useEffect(() => setLimit(REVEAL), [tab, find, grouped, items])

  // The Slack agent answers from a reverse index of this collection, which a
  // finishing run rebuilds. Opening the collection repairs one that drifted
  // anyway — rows that predate the index, or a run that never reached its last
  // step. It runs behind the page and never blocks or interrupts it.
  const name = summary?.name
  useEffect(() => {
    if (!name || loading) return
    let cancelled = false
    loadIndexStatus(name)
      .then((status) => {
        if (!cancelled && status.stale) return rebuildIndex(name)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [name, loading, all.length])

  const totalRows = tab === 'values' ? shownGroups.length : shownCompanies.length
  const hasMore = limit < totalRows

  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((current) => current + REVEAL)
      },
      { root: scrollRef.current ?? null, rootMargin: '700px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, limit, scrollRef])

  const max = shownGroups[0]?.companies.length ?? 1

  const profileUrl = (item: CollectionItem) =>
    item.source === 'yc' ? `https://www.ycombinator.com/companies/${item.slug}` : ''

  /**
   * Export what's on screen: the active tab's shape, the active filters, the
   * active search. A CSV that doesn't match the view is a support ticket.
   */
  const exportCsv = () => {
    const name = summary?.name ?? 'collection'

    if (tab === 'values') {
      // Long format — one row per (value, company) pair, which is what pivots.
      const rows = shownGroups.flatMap((group) =>
        group.companies.map((company) => [
          group.name,
          group.variants.join('; '),
          group.companies.length,
          company.name,
          company.slug,
          company.source,
          company.batch,
          profileUrl(company),
          company.website ?? '',
        ]),
      )
      download(
        `${name}-by-${valueLabel}-${stamp()}.csv`,
        toCsv(
          [
            valueLabel,
            'spellings',
            'company_count',
            'company',
            'company_slug',
            'source',
            'batch',
            'profile_url',
            'website',
          ],
          rows,
        ),
      )
      return
    }

    // Wide format — one row per company. Source attributes become columns on
    // their own, so a new source widens the sheet instead of needing new code.
    const attributes = [
      ...new Set(shownCompanies.flatMap((c) => Object.keys(c.sourceData ?? {}))),
    ].sort()
    const rows = shownCompanies.map((company) => [
      company.name,
      company.slug,
      company.source,
      company.status,
      company.values.length,
      company.values.join('; '),
      company.citations.map((c) => c.url).join('; '),
      profileUrl(company),
      company.website ?? '',
      company.updatedAt,
      ...attributes.map((key) => {
        const value = company.sourceData?.[key]
        return Array.isArray(value) ? value.join('; ') : (value ?? '')
      }),
    ])
    download(
      `${name}-by-company-${stamp()}.csv`,
      toCsv(
        [
          'company',
          'slug',
          'source',
          'result',
          `${valueLabel}_count`,
          `${valueLabel}s`,
          'citations',
          'profile_url',
          'website',
          'updated_at',
          ...attributes,
        ],
        rows,
      ),
    )
  }

  const exportCount = tab === 'values' ? shownGroups.length : shownCompanies.length

  if (loading) {
    return (
      <div className="centered">
        <div className="spinner" />
        <p>Loading collection…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="banner">
        <Icon name="alert" />
        <span>{error}</span>
      </div>
    )
  }

  if (!all.length) {
    return (
      <>
        <div className="page-head">
          <h1>{summary?.label ?? 'Collection'}</h1>
          <p>{summary?.description}</p>
        </div>
        <div className="centered">
          <Icon name="empty" />
          <h3>Nothing collected yet</h3>
          <p>
            Filter the Y Combinator list to the companies you care about, then run the{' '}
            {summary?.label.toLowerCase()} workflow over them.
          </p>
          <button type="button" className="btn" onClick={onGoToSource}>
            Go to Y Combinator
            <Icon name="arrow" />
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="page-head split">
        <div>
          <h1>{summary?.label ?? 'Collection'}</h1>
          <p>
            {activeFilters > 0 && (
              <>
                <span className="tab">{fmt.format(stats.companies)}</span> of{' '}
                <span className="tab">{fmt.format(all.length)}</span> companies ·{' '}
              </>
            )}
            {activeFilters === 0 && (
              <>
                <span className="tab">{fmt.format(stats.companies)}</span> companies ·{' '}
              </>
            )}
            <span className="tab">{fmt.format(groups.length)}</span> distinct {valueLabel}s ·{' '}
            <span className="tab">{money(stats.cost)}</span> spent
          </p>
        </div>
        <div className="headactions">
          <button
            type="button"
            className="btn sm"
            onClick={exportCsv}
            disabled={!exportCount}
            title={
              tab === 'values'
                ? `One row per ${valueLabel} and company`
                : 'One row per company'
            }
          >
            <Icon name="download" />
            Export CSV
          </button>
          <button type="button" className="btn ghost sm" onClick={onReload}>
            <Icon name="refresh" />
            Refresh
          </button>
          {confirmClear ? (
            <>
              <button
                type="button"
                className="btn danger sm"
                onClick={() => {
                  setConfirmClear(false)
                  onClear()
                }}
              >
                Delete {fmt.format(stats.companies)} rows
              </button>
              <button type="button" className="btn ghost sm" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn ghost sm" onClick={() => setConfirmClear(true)}>
              <Icon name="trash" />
              Clear
            </button>
          )}
        </div>
      </div>

      <CollectionFilterBar
        state={filter}
        counts={counts}
        source={source}
        onChange={onFilter}
      />

      {activeFilters > 0 && !items.length && (
        <div className="centered">
          <Icon name="empty" />
          <h3>No rows match these filters</h3>
          <p>{fmt.format(all.length)} rows are in the collection, but none pass the current filters.</p>
          <button type="button" className="btn ghost sm" onClick={onResetFilters}>
            Reset filters
          </button>
        </div>
      )}

      <div className="statrow">
        <span className="badge t-green">{fmt.format(stats.withValues)} with results</span>
        <span className="badge t-dim">{fmt.format(stats.empty)} published nothing</span>
        {stats.failed > 0 && (
          <span className="badge t-red">{fmt.format(stats.failed)} failed</span>
        )}
      </div>

      <div className="toolbar">
        <div className="tabs">
          <button
            type="button"
            className={tab === 'values' ? 'tab-btn on' : 'tab-btn'}
            onClick={() => setTab('values')}
          >
            By {valueLabel}
          </button>
          <button
            type="button"
            className={tab === 'companies' ? 'tab-btn on' : 'tab-btn'}
            onClick={() => setTab('companies')}
          >
            By company
          </button>
        </div>

        <div className="searchwrap grow">
          <Icon name="search" />
          <input
            className="search"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder={`Search ${valueLabel}s or companies…`}
            aria-label={`Search ${valueLabel}s or companies`}
          />
          {find && (
            <button type="button" className="clear" onClick={() => setFind('')} aria-label="Clear">
              <Icon name="x" />
            </button>
          )}
        </div>

        {tab === 'values' && (
          <button
            type="button"
            className={grouped ? 'opt on inline' : 'opt inline'}
            onClick={() => setGrouped((v) => !v)}
            title="Merge Retool and Retool, Inc. into one row"
          >
            <span className="box" aria-hidden="true">
              <Icon name="check" />
            </span>
            <span className="txt">Group similar names</span>
          </button>
        )}
      </div>

      {tab === 'values' ? (
        <div className="list">
          {shownGroups.slice(0, limit).map((group, i) => {
            const isOpen = open === group.key
            return (
              <div key={group.key}>
                <div className="rankrow">
                <button
                  type="button"
                  className="rankmain"
                  onClick={() => setOpen(isOpen ? null : group.key)}
                  aria-expanded={isOpen}
                >
                  <span className="rank tab">{i + 1}</span>
                  <span className="rankbody">
                    <span className="ranktop">
                      <strong>{group.name}</strong>
                      {group.variants.length > 1 && (
                        <span className="badge t-dim">{group.variants.length} spellings</span>
                      )}
                    </span>
                    <span className="bar thin">
                      <span
                        className="fill"
                        style={{ width: `${(group.companies.length / max) * 100}%` }}
                      />
                    </span>
                  </span>
                  <span className="rankn tab">{fmt.format(group.companies.length)}</span>
                  <span className={isOpen ? 'caret open' : 'caret'}>
                    <Icon name="chevron" />
                  </span>
                </button>

                <BookmarkMenu
                  targets={group.companies.map(fromItem)}
                  lists={lists}
                  membership={membership}
                  onChanged={onBookmarked}
                  compact
                />
                </div>

                {isOpen && (
                  <div className="drill">
                    {group.variants.length > 1 && (
                      <p className="hint">Spellings: {group.variants.join(' · ')}</p>
                    )}
                    <div className="taglist">
                      {group.companies.map((company) => (
                        <a
                          key={company.slug}
                          className="badge t-accent"
                          href={`https://www.ycombinator.com/companies/${company.slug}`}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          {company.name}
                          {company.batch ? ` · ${company.batch}` : ''}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {!shownGroups.length && (
            <div className="centered">
              <Icon name="empty" />
              <h3>No {valueLabel} matches “{find}”</h3>
            </div>
          )}
          <Reveal shown={Math.min(limit, totalRows)} total={totalRows} sentinel={sentinel} />
        </div>
      ) : (
        <div className="list">
          {shownCompanies.slice(0, limit).map((company) => (
            <div key={company.slug} className="row static">
              <div className="rowbody">
                <div className="rowtop">
                  <h3>{company.name}</h3>
                  {company.batch && <span className="badge t-accent">{company.batch}</span>}
                  {company.status === 'empty' && (
                    <span className="badge t-dim">nothing published</span>
                  )}
                  {company.status === 'error' && <span className="badge t-red">failed</span>}
                </div>
                {company.status === 'error' && company.error && (
                  <p className="oneliner">{company.error}</p>
                )}
                {company.values.length > 0 && (
                  <div className="taglist" style={{ marginTop: 7 }}>
                    {company.values.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className="badge t-dim"
                        onClick={() => {
                          setFind(value)
                          setTab('values')
                        }}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                )}
                {company.citations.length > 0 && (
                  <div className="meta" style={{ marginTop: 8 }}>
                    <Icon name="link" />
                    {company.citations.map((citation) => (
                      <a
                        key={citation.url}
                        href={citation.url}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {citation.host}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <span className="rankn tab">{fmt.format(company.values.length)}</span>
              <BookmarkMenu
                targets={[fromItem(company)]}
                lists={lists}
                membership={membership}
                onChanged={onBookmarked}
                compact
              />
            </div>
          ))}
          {!shownCompanies.length && (
            <div className="centered">
              <Icon name="empty" />
              <h3>No company matches “{find}”</h3>
            </div>
          )}
          <Reveal shown={Math.min(limit, totalRows)} total={totalRows} sentinel={sentinel} />
        </div>
      )}
    </>
  )
}
