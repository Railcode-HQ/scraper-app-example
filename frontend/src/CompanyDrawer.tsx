import { useEffect } from 'react'
import { Icon, Logo, StatusBadge, fmt } from './ui'
import BookmarkMenu from './BookmarkMenu'
import { fromCompany } from './bookmarks'
import type { Disjunctive } from './filters'
import type { BookmarkList, Company, Membership } from './types'

function launchedOn(seconds: number | null): string | null {
  if (!seconds) return null
  return new Date(seconds * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

export default function CompanyDrawer({
  slug,
  company,
  loading,
  onClose,
  onFilter,
  lists,
  membership,
  onBookmarked,
}: {
  slug: string
  company: Company | null
  loading: boolean
  onClose: () => void
  onFilter: (facet: Disjunctive, value: string) => void
  lists: BookmarkList[]
  membership: Membership
  onBookmarked: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const ycUrl = `https://www.ycombinator.com/companies/${slug}`

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={company?.name ?? slug}>
        {loading && (
          <div className="centered" style={{ flex: 1 }}>
            <div className="spinner" />
            <p>Loading company…</p>
          </div>
        )}

        {!loading && !company && (
          <div className="centered" style={{ flex: 1 }}>
            <Icon name="alert" />
            <h3>Company not found</h3>
            <p>
              Nothing in the index matches “{slug}”. It may have been renamed or removed from the
              public directory.
            </p>
            <button type="button" className="btn ghost sm" onClick={onClose}>
              Back to directory
            </button>
          </div>
        )}

        {!loading && company && (
          <>
            <div className="dhead">
              <Logo src={company.small_logo_thumb_url} name={company.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2>{company.name}</h2>
                <div className="rowtop" style={{ marginTop: 6 }}>
                  {company.batch && company.batch !== 'Unspecified' && (
                    <span className="badge t-accent">{company.batch}</span>
                  )}
                  {company.top_company && (
                    <span className="badge t-amber">
                      <Icon name="star" fill />
                      Top company
                    </span>
                  )}
                  <StatusBadge status={company.status} />
                  {company.isHiring && <span className="badge t-green">Hiring</span>}
                  {company.nonprofit && <span className="badge t-violet">Nonprofit</span>}
                </div>
              </div>
              <button
                type="button"
                className="iconbtn"
                style={{ display: 'grid' }}
                onClick={onClose}
                aria-label="Close"
              >
                <Icon name="x" />
              </button>
            </div>

            <div className="dbody">
              {company.one_liner && (
                <p style={{ margin: 0, fontSize: 14, fontWeight: 550 }}>{company.one_liner}</p>
              )}

              {company.long_description && (
                <div className="dsect">
                  <h4>About</h4>
                  <p className="desc">{company.long_description.trim()}</p>
                </div>
              )}

              <div className="dsect">
                <h4>Details</h4>
                <dl className="kv">
                  <Row label="Website">
                    {company.website ? (
                      <a href={company.website} target="_blank" rel="noreferrer noopener">
                        {company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    ) : null}
                  </Row>
                  <Row label="Location">{company.all_locations || null}</Row>
                  <Row label="Team size">
                    {company.team_size ? (
                      <span className="tab">{fmt.format(company.team_size)}</span>
                    ) : null}
                  </Row>
                  <Row label="Industry">{company.industry || null}</Row>
                  <Row label="Sub-industry">
                    {company.subindustry?.includes(' -> ')
                      ? company.subindustry.slice(company.subindustry.indexOf(' -> ') + 4)
                      : null}
                  </Row>
                  <Row label="Stage">{company.stage || null}</Row>
                  <Row label="Launched">{launchedOn(company.launched_at)}</Row>
                  <Row label="Former names">
                    {company.former_names?.length ? company.former_names.join(', ') : null}
                  </Row>
                </dl>
              </div>

              {company.tags.length > 0 && (
                <div className="dsect">
                  <h4>Tags</h4>
                  <div className="taglist">
                    {company.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="badge t-dim"
                        onClick={() => onFilter('tags', tag)}
                        title={`Filter the directory by “${tag}”`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {company.regions.length > 0 && (
                <div className="dsect">
                  <h4>Regions</h4>
                  <div className="taglist">
                    {company.regions.map((region) => (
                      <button
                        key={region}
                        type="button"
                        className="badge t-dim"
                        onClick={() => onFilter('regions', region)}
                        title={`Filter the directory by “${region}”`}
                      >
                        {region}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="dfoot">
              <BookmarkMenu
                targets={[fromCompany(company)]}
                lists={lists}
                membership={membership}
                onChanged={onBookmarked}
              />
              <a
                className="btn"
                href={ycUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                YC profile
                <Icon name="external" />
              </a>
              {company.website && (
                <a
                  className="btn ghost"
                  href={company.website}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Visit site
                  <Icon name="external" />
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
