import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './Sidebar'
import CompanyDrawer from './CompanyDrawer'
import RunDialog from './RunDialog'
import Source from './views/Source'
import Collections from './views/Collections'
import Collection from './views/Collection'
import Runs from './views/Runs'
import CustomSource from './views/CustomSource'
import Lists from './views/Lists'
import List from './views/List'
import * as api from './api'
import {
  EMPTY,
  describe,
  fromQuery,
  toQuery,
  toSearchBody,
  toggleValue,
  type Disjunctive,
  type FilterState,
} from './filters'
import { parseRoute, useLocation } from './router'
import {
  EMPTY_FILTER,
  activeCount as collectionActiveCount,
  counts as collectionCounts,
  filterFromQuery,
  filterToQuery,
  matches as collectionMatches,
  sourceById,
} from './sources'
import { Icon } from './ui'
import type {
  Bookmark,
  CustomCompany,
  BookmarkList,
  Membership,
  CollectionItem,
  CollectionSummary,
  Company,
  FacetCounts,
  Run,
  SearchResponse,
  WorkflowInfo,
} from './types'

export default function App() {
  const [loc, navigate] = useLocation()
  const route = useMemo(() => parseRoute(loc.pathname), [loc.pathname])

  // A collection page's query string holds collection filters, not YC ones, so
  // the YC filter set is remembered rather than re-read from whatever URL is
  // current. Otherwise a trip to Collections and back would silently clear it.
  const [ycQuery, setYcQuery] = useState(() =>
    parseRoute(window.location.pathname).name === 'yc' ? window.location.search : '',
  )
  useEffect(() => {
    if (route.name === 'yc') setYcQuery(loc.search)
  }, [route.name, loc.search])

  const ycFilters = useMemo(() => fromQuery(ycQuery), [ycQuery])
  const ycQueryKey = useMemo(() => toQuery(ycFilters), [ycFilters])

  // ── collection filters ────────────────────────────────────────────────────
  const collectionFilter = useMemo(
    () => (route.name === 'collection' ? filterFromQuery(loc.search) : EMPTY_FILTER),
    [route.name, loc.search],
  )
  const setCollectionFilter = useCallback(
    (next: typeof EMPTY_FILTER) => navigate(loc.pathname + filterToQuery(next)),
    [navigate, loc.pathname],
  )
  const collectionSource = useMemo(
    () => sourceById(collectionFilter.source),
    [collectionFilter.source],
  )

  const [navOpen, setNavOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement | null>(null)

  const setFilters = useCallback(
    (next: FilterState, replace = false) => navigate('/yc' + toQuery(next), replace),
    [navigate],
  )

  // ── the source list ───────────────────────────────────────────────────────
  const [hits, setHits] = useState<Company[]>([])
  const [meta, setMeta] = useState<SearchResponse | null>(null)
  const [facets, setFacets] = useState<FacetCounts>({})
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const hitsRef = useRef<Company[]>([])
  useEffect(() => {
    hitsRef.current = hits
  }, [hits])

  const [draft, setDraft] = useState(ycFilters.q)
  useEffect(() => setDraft(ycFilters.q), [ycFilters.q])
  useEffect(() => {
    if (draft === ycFilters.q) return
    const id = setTimeout(() => setFilters({ ...ycFilters, q: draft }, true), 250)
    return () => clearTimeout(id)
  }, [draft, ycFilters, setFilters])

  useEffect(() => {
    // Only the source page reads these results. Firing the search from a
    // collection or list page just delayed the request that page needed.
    if (route.name !== 'yc') return
    const controller = new AbortController()
    setLoading(true)
    setSearchError(null)
    api
      .search(fromQuery(ycQueryKey.replace(/^\?/, '')), 0, controller.signal)
      .then((res) => {
        setHits(res.hits)
        setMeta(res)
        // Facet counts only ever come from a fresh first page; appending a
        // later page must not overwrite them.
        setFacets(res.facets)
        setLoading(false)
        if (contentRef.current) contentRef.current.scrollTop = 0
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setSearchError(err instanceof Error ? err.message : 'Search failed')
        setLoading(false)
      })
    return () => controller.abort()
  }, [ycQueryKey, route.name])

  const loadMore = useCallback(() => {
    if (!meta || loading || loadingMore) return
    const next = meta.page + 1
    if (next >= meta.nbPages) return
    setLoadingMore(true)
    api
      .search(ycFilters, next)
      .then((res) => {
        setHits((current) => {
          const seen = new Set(current.map((c) => c.objectID))
          return [...current, ...res.hits.filter((c) => !seen.has(c.objectID))]
        })
        setMeta(res)
        setLoadingMore(false)
      })
      .catch(() => setLoadingMore(false))
  }, [meta, loading, loadingMore, ycFilters])

  // ── collections, runs ─────────────────────────────────────────────────────
  const [collections, setCollections] = useState<CollectionSummary[]>([])
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [runsLoading, setRunsLoading] = useState(true)

  const refreshCollections = useCallback(
    () => api.loadCollections().then(setCollections).catch(() => {}),
    [],
  )

  useEffect(() => {
    api
      .loadWorkflows()
      .then((res) => setWorkflows(res.workflows))
      .catch(() => {})
    refreshCollections()
    api
      .loadRuns()
      .then(setRuns)
      .catch(() => {})
      .finally(() => setRunsLoading(false))
  }, [refreshCollections])

  // ── bookmarks ─────────────────────────────────────────────────────────────
  // Lists and the full membership map are small and read constantly (every row
  // shows its own state), so they're fetched whole and refreshed on change.
  const [lists, setLists] = useState<BookmarkList[]>([])
  const [membership, setMembership] = useState<Membership>({})
  const [listsLoading, setListsLoading] = useState(true)

  const refreshBookmarks = useCallback(
    () =>
      Promise.all([api.loadLists(), api.loadMembership()])
        .then(([nextLists, nextMembership]) => {
          setLists(nextLists)
          setMembership(nextMembership)
        })
        .catch(() => {}),
    [],
  )

  useEffect(() => {
    refreshBookmarks().finally(() => setListsLoading(false))
  }, [refreshBookmarks])

  const openList = route.name === 'lists' ? route.id : null
  const [listRows, setListRows] = useState<Bookmark[]>([])
  const [listRowsLoading, setListRowsLoading] = useState(false)

  const refreshListRows = useCallback(() => {
    if (!openList) return Promise.resolve()
    return api
      .loadListItems(openList)
      .then(setListRows)
      .catch(() => {})
      .finally(() => setListRowsLoading(false))
  }, [openList])

  useEffect(() => {
    if (!openList) return
    setListRows([])
    setListRowsLoading(true)
    refreshListRows()
  }, [openList, refreshListRows])

  /** After any bookmark change: the counts, the membership, and the open list. */
  const onBookmarked = useCallback(() => {
    void refreshBookmarks()
    void refreshListRows()
  }, [refreshBookmarks, refreshListRows])

  // ── the custom source ─────────────────────────────────────────────────────
  const [customCompanies, setCustomCompanies] = useState<CustomCompany[]>([])
  const [customLoading, setCustomLoading] = useState(true)

  const refreshCustom = useCallback(
    () =>
      api
        .loadCustomCompanies()
        .then(setCustomCompanies)
        .catch(() => {})
        .finally(() => setCustomLoading(false)),
    [],
  )

  useEffect(() => {
    void refreshCustom()
  }, [refreshCustom])

  const customQuery =
    route.name === 'custom' ? (new URLSearchParams(loc.search).get('q') ?? '') : ''

  const shownCustom = useMemo(() => {
    const needle = customQuery.trim().toLowerCase()
    if (!needle) return customCompanies
    return customCompanies.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.description.toLowerCase().includes(needle) ||
        c.note.toLowerCase().includes(needle) ||
        c.slug.includes(needle),
    )
  }, [customCompanies, customQuery])

  const activeRun = useMemo(() => runs.find((r) => r.status === 'running') ?? null, [runs])

  /**
   * The run loop. A worker request can't stay open for the minutes a few hundred
   * Exa calls take, so the browser walks the run one batch at a time. Because
   * the cursor lives in KV, a reload picks the loop back up where it stopped.
   */
  const driving = useRef(false)
  useEffect(() => {
    if (!activeRun || driving.current) return
    const runId = activeRun.id
    driving.current = true
    let cancelled = false

    void (async () => {
      for (;;) {
        if (cancelled) break
        try {
          const { run } = await api.stepRun(runId)
          if (cancelled) break
          setRuns((list) => list.map((r) => (r.id === run.id ? run : r)))
          if (run.status !== 'running') break
        } catch {
          // Leave the run as-is: it stays resumable from the Runs page.
          setRuns((list) =>
            list.map((r) => (r.id === runId ? { ...r, status: 'stopped' as const } : r)),
          )
          break
        }
      }
      driving.current = false
      if (!cancelled) refreshCollections()
    })()

    return () => {
      cancelled = true
      driving.current = false
    }
  }, [activeRun?.id, refreshCollections])

  // ── one collection's rows ─────────────────────────────────────────────────
  const [items, setItems] = useState<CollectionItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [itemsError, setItemsError] = useState<string | null>(null)
  const openCollection = route.name === 'collection' ? route.collection : null

  const refreshItems = useCallback(() => {
    if (!openCollection) return
    setItemsError(null)
    api
      .loadCollectionItems(openCollection)
      .then(setItems)
      .catch((err: unknown) =>
        setItemsError(err instanceof Error ? err.message : 'Could not load the collection'),
      )
      .finally(() => setItemsLoading(false))
  }, [openCollection])

  useEffect(() => {
    if (!openCollection) return
    setItems([])
    setItemsLoading(true)
    refreshItems()
  }, [openCollection, refreshItems])

  // Counts and the surviving rows. Collections are fully loaded client-side, so
  // the rail can afford proper disjunctive counts — each axis counted with its
  // own selection removed, exactly as the live YC rail behaves.
  const railCounts = useMemo(
    () => collectionCounts(items, collectionFilter, collectionSource),
    [items, collectionFilter, collectionSource],
  )
  const filteredItems = useMemo(
    () => items.filter((item) => collectionMatches(item, collectionFilter, collectionSource)),
    [items, collectionFilter, collectionSource],
  )

  // Watch a run fill the collection you're looking at, rather than making the
  // user hit refresh to find out whether anything landed.
  useEffect(() => {
    if (!openCollection || !activeRun || activeRun.collection !== openCollection) return
    refreshItems()
  }, [openCollection, activeRun?.cursor, activeRun?.collection, refreshItems])

  // ── the open company ──────────────────────────────────────────────────────
  const openSlug = route.name === 'yc' ? route.slug : null
  const [drawer, setDrawer] = useState<{ company: Company | null; loading: boolean }>({
    company: null,
    loading: false,
  })

  useEffect(() => {
    if (!openSlug) {
      setDrawer({ company: null, loading: false })
      return
    }
    const known = hitsRef.current.find((c) => c.slug === openSlug)
    if (known) {
      setDrawer({ company: known, loading: false })
      return
    }
    // A deep link arrives before any search has run, so resolve it on its own.
    setDrawer({ company: null, loading: true })
    let live = true
    api
      .loadCompany(openSlug)
      .then((company) => live && setDrawer({ company, loading: false }))
      .catch(() => live && setDrawer({ company: null, loading: false }))
    return () => {
      live = false
    }
  }, [openSlug])

  // ── starting a run ────────────────────────────────────────────────────────
  /** What a run would be applied to, captured when the dialog opens. */
  interface Pending {
    source: string
    filters: unknown
    filterLabel: string
    matched: number
    reachable: number
  }

  const [pending, setPending] = useState<Pending | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const start = async (workflowId: string, limit: number) => {
    if (!pending) return
    setStarting(true)
    setStartError(null)
    try {
      const run = await api.startRun({
        workflow: workflowId,
        source: pending.source,
        filters: pending.filters,
        filterLabel: pending.filterLabel,
        limit,
      })
      setRuns((list) => [run, ...list])
      setPending(null)
      navigate('/runs')
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start the run')
    } finally {
      setStarting(false)
    }
  }

  const patchRun = (run: Run) => setRuns((list) => list.map((r) => (r.id === run.id ? run : r)))

  const go = (to: string) => {
    setNavOpen(false)
    navigate(to)
  }

  const crumb =
    route.name === 'yc'
      ? ['Sources', 'Y Combinator']
      : route.name === 'custom'
        ? ['Sources', 'Custom companies']
      : route.name === 'runs'
        ? ['Runs']
        : route.name === 'lists'
          ? ['Lists', ...(route.id ? [lists.find((l) => l.id === route.id)?.name ?? 'List'] : [])]
        : route.name === 'collection'
          ? ['Collections', collections.find((c) => c.name === route.collection)?.label ?? route.collection]
          : ['Collections']

  const summary = collections.find((c) => c.name === openCollection) ?? null

  return (
    <div className={navOpen ? 'app navopen' : 'app'}>
      <div className="scrim nav" onClick={() => setNavOpen(false)} />

      <Sidebar
        route={route}
        collections={collections}
        lists={lists}
        customCount={customCompanies.length}
        navigate={go}
        activeRun={activeRun}
        onStopRun={() => activeRun && api.stopRun(activeRun.id).then(patchRun).catch(() => {})}
        filterQuery={ycQueryKey}
      />

      <main>
        <div className="topbar">
          <button
            type="button"
            className="iconbtn"
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Menu"
          >
            <Icon name="filter" />
          </button>

          <div className="crumb">
            <span>Scrape</span>
            {crumb.map((part, i) => (
              <span key={part} style={{ display: 'contents' }}>
                <span>/</span>
                {i === crumb.length - 1 ? <b>{part}</b> : <span>{part}</span>}
              </span>
            ))}
          </div>

          <div className="spacer" />

          {route.name === 'yc' && (
            <>
              <div className="searchwrap">
                <Icon name="search" />
                <input
                  className="search"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Search name, description, tag…"
                  aria-label="Search companies"
                  autoComplete="off"
                />
                {draft && (
                  <button
                    type="button"
                    className="clear"
                    onClick={() => setDraft('')}
                    aria-label="Clear search"
                  >
                    <Icon name="x" />
                  </button>
                )}
              </div>

              <select
                className="sel"
                value={ycFilters.sort}
                onChange={(e) =>
                  setFilters({
                    ...ycFilters,
                    sort: e.target.value === 'launch' ? 'launch' : 'relevance',
                  })
                }
                aria-label="Sort results"
              >
                <option value="relevance">Relevance</option>
                <option value="launch">Launch date</option>
              </select>
            </>
          )}
        </div>

        <div className="content" ref={contentRef}>
          {route.name === 'yc' && (
            <Source
              hits={hits}
              meta={meta}
              loading={loading}
              loadingMore={loadingMore}
              error={searchError}
              facets={facets}
              filters={ycFilters}
              onFilters={(next) => setFilters(next)}
              onOpen={(company) => navigate('/yc/' + encodeURIComponent(company.slug) + ycQueryKey)}
              onLoadMore={loadMore}
              onRun={() => {
                setStartError(null)
                setPending({
                  source: 'yc',
                  filters: toSearchBody(ycFilters),
                  filterLabel: describe(ycFilters),
                  matched: meta?.nbHits ?? 0,
                  reachable: meta?.reachable ?? 0,
                })
              }}
              canRun={!!meta && meta.nbHits > 0 && workflows.length > 0 && !activeRun}
              scrollRef={contentRef}
              lists={lists}
              membership={membership}
              onBookmarked={onBookmarked}
            />
          )}

          {route.name === 'custom' && (
            <CustomSource
              companies={shownCustom}
              total={customCompanies.length}
              loading={customLoading}
              query={customQuery}
              onQuery={(next) => navigate('/custom' + (next.trim() ? `?q=${encodeURIComponent(next)}` : ''), true)}
              onChanged={refreshCustom}
              onRun={() => {
                setStartError(null)
                setPending({
                  source: 'custom',
                  filters: { q: customQuery },
                  filterLabel: customQuery.trim()
                    ? `Custom companies matching “${customQuery.trim()}”`
                    : 'All custom companies',
                  matched: shownCustom.length,
                  reachable: shownCustom.length,
                })
              }}
              canRun={shownCustom.length > 0 && workflows.length > 0 && !activeRun}
              lists={lists}
              membership={membership}
              onBookmarked={onBookmarked}
            />
          )}

          {route.name === 'collections' && (
            <Collections
              collections={collections}
              loading={!collections.length}
              onOpen={(name) => go('/collections/' + name)}
            />
          )}

          {route.name === 'collection' && (
            <Collection
              summary={summary}
              all={items}
              items={filteredItems}
              loading={itemsLoading}
              error={itemsError}
              filter={collectionFilter}
              counts={railCounts}
              source={collectionSource}
              onFilter={setCollectionFilter}
              activeFilters={collectionActiveCount(collectionFilter)}
              onResetFilters={() => navigate(loc.pathname)}
              onReload={refreshItems}
              onClear={() =>
                openCollection &&
                api
                  .clearCollection(openCollection)
                  .then(() => {
                    setItems([])
                    refreshCollections()
                  })
                  .catch(() => {})
              }
              onGoToSource={() => go('/yc')}
              scrollRef={contentRef}
              lists={lists}
              membership={membership}
              onBookmarked={onBookmarked}
            />
          )}

          {route.name === 'lists' && !route.id && (
            <Lists
              lists={lists}
              loading={listsLoading}
              onOpen={(id) => go('/lists/' + id)}
              onCreate={async (name) => {
                const list = await api.createList(name)
                await refreshBookmarks()
                go('/lists/' + list.id)
              }}
            />
          )}

          {route.name === 'lists' && route.id && (
            <List
              list={lists.find((l) => l.id === route.id) ?? null}
              items={listRows}
              loading={listRowsLoading || listsLoading}
              onRemove={(refs) =>
                route.id &&
                api.removeBookmarks(route.id, refs).then(onBookmarked).catch(() => {})
              }
              onRename={(name) =>
                route.id && api.renameList(route.id, name).then(refreshBookmarks).catch(() => {})
              }
              onDelete={() =>
                route.id &&
                api
                  .deleteList(route.id)
                  .then(() => {
                    void refreshBookmarks()
                    go('/lists')
                  })
                  .catch(() => {})
              }
              onBack={() => go('/lists')}
            />
          )}

          {route.name === 'runs' && (
            <Runs
              runs={runs}
              loading={runsLoading}
              onStop={(id) => api.stopRun(id).then(patchRun).catch(() => {})}
              onResume={(id) => api.resumeRun(id).then(patchRun).catch(() => {})}
              onDelete={(id) =>
                api.deleteRun(id).then(() => setRuns((list) => list.filter((r) => r.id !== id)))
              }
              onOpenCollection={(collection) => go('/collections/' + collection)}
              onGoToSource={() => go('/yc')}
            />
          )}
        </div>
      </main>

      {openSlug && (
        <CompanyDrawer
          slug={openSlug}
          company={drawer.company}
          loading={drawer.loading}
          onClose={() => navigate('/yc' + ycQueryKey)}
          onFilter={(facet: Disjunctive, value: string) =>
            setFilters({
              ...ycFilters,
              selected: {
                ...ycFilters.selected,
                [facet]: toggleValue(ycFilters.selected[facet], value),
              },
            })
          }
          lists={lists}
          membership={membership}
          onBookmarked={onBookmarked}
        />
      )}

      {pending && (
        <RunDialog
          workflows={workflows}
          matched={pending.matched}
          reachable={pending.reachable}
          filterLabel={pending.filterLabel}
          starting={starting}
          error={startError}
          onStart={start}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  )
}
