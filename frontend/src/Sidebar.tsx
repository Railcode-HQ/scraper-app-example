import { Icon, ThemeSwitch, fmt, money } from './ui'
import type { Route } from './router'
import type { BookmarkList, CollectionSummary, Run } from './types'

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: string
  label: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={active ? 'navitem on' : 'navitem'}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <Icon name={icon} />
      <span className="txt">{label}</span>
      {count !== undefined && count > 0 && <span className="n">{fmt.format(count)}</span>}
    </button>
  )
}

/**
 * Navigation only. Filters belong above the list they filter, not in the app's
 * global chrome — what you can filter changes with the page, and the rail
 * shouldn't.
 */
export default function Sidebar({
  route,
  collections,
  lists,
  customCount,
  navigate,
  activeRun,
  onStopRun,
  filterQuery,
}: {
  route: Route
  collections: CollectionSummary[]
  lists: BookmarkList[]
  customCount: number
  navigate: (to: string) => void
  activeRun: Run | null
  onStopRun: () => void
  filterQuery: string
}) {
  return (
    <aside>
      <div className="brand">
        Scrape
        <span>Company lists &amp; extractions</span>
      </div>

      <div className="rail">
        <section>
          <div className="eyebrow">
            <span>Sources</span>
          </div>
          <div className="nav">
            <NavItem
              icon="list"
              label="Y Combinator"
              active={route.name === 'yc'}
              onClick={() => navigate('/yc' + filterQuery)}
            />
            <NavItem
              icon="plus"
              label="Custom companies"
              count={customCount}
              active={route.name === 'custom'}
              onClick={() => navigate('/custom')}
            />
          </div>
        </section>

        <section>
          <div className="eyebrow">
            <span>Collections</span>
          </div>
          <div className="nav">
            <NavItem
              icon="layers"
              label="All collections"
              active={route.name === 'collections'}
              onClick={() => navigate('/collections')}
            />
            {collections.map((collection) => (
              <NavItem
                key={collection.name}
                icon="arrow"
                label={collection.label}
                count={collection.companies}
                active={route.name === 'collection' && route.collection === collection.name}
                onClick={() => navigate('/collections/' + collection.name)}
              />
            ))}
          </div>
        </section>

        <section>
          <div className="eyebrow">
            <span>Lists</span>
          </div>
          <div className="nav">
            <NavItem
              icon="bookmark"
              label="All lists"
              active={route.name === 'lists' && !route.id}
              onClick={() => navigate('/lists')}
            />
            {lists.map((list) => (
              <NavItem
                key={list.id}
                icon="arrow"
                label={list.name}
                count={list.count}
                active={route.name === 'lists' && route.id === list.id}
                onClick={() => navigate('/lists/' + list.id)}
              />
            ))}
          </div>
        </section>

        <section>
          <div className="eyebrow">
            <span>Activity</span>
          </div>
          <div className="nav">
            <NavItem
              icon="activity"
              label="Runs"
              active={route.name === 'runs'}
              onClick={() => navigate('/runs')}
            />
          </div>
        </section>
      </div>

      {activeRun && activeRun.status === 'running' && (
        <div className="railfoot run">
          <div className="runline">
            <div className="spinner" />
            <span className="txt">{activeRun.workflowLabel}</span>
            <button type="button" className="btn ghost sm" onClick={onStopRun}>
              Stop
            </button>
          </div>
          <div className="bar">
            <div
              className="fill"
              style={{ width: `${Math.round((activeRun.cursor / Math.max(activeRun.targetCount, 1)) * 100)}%` }}
            />
          </div>
          <div className="runmeta">
            <span className="tab">
              {fmt.format(activeRun.cursor)} of {fmt.format(activeRun.targetCount)}
            </span>
            <span className="tab">{money(activeRun.costUsd)}</span>
          </div>
        </div>
      )}

      <div className="railfoot">
        <span>Theme</span>
        <ThemeSwitch />
      </div>
    </aside>
  )
}
