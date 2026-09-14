import { useMemo, useState } from 'react'
import { Icon, fmt } from '../ui'
import { download, stamp, toCsv } from '../csv'
import type { Bookmark, BookmarkList } from '../types'

const profileUrl = (mark: Bookmark) =>
  mark.source === 'yc' ? `https://www.ycombinator.com/companies/${mark.slug}` : (mark.website ?? '')

/** One list: what's on it, minus what you take off, out to CSV. */
export default function List({
  list,
  items,
  loading,
  onRemove,
  onRename,
  onDelete,
  onBack,
}: {
  list: BookmarkList | null
  items: Bookmark[]
  loading: boolean
  onRemove: (refs: { source: string; slug: string }[]) => void
  onRename: (name: string) => void
  onDelete: () => void
  onBack: () => void
}) {
  const [find, setFind] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const shown = useMemo(() => {
    const needle = find.trim().toLowerCase()
    const rows = [...items].sort((a, b) => a.name.localeCompare(b.name))
    if (!needle) return rows
    return rows.filter(
      (r) => r.name.toLowerCase().includes(needle) || r.batch.toLowerCase().includes(needle),
    )
  }, [items, find])

  const sources = useMemo(() => [...new Set(items.map((i) => i.source))], [items])

  const exportCsv = () => {
    const attributes = [...new Set(shown.flatMap((m) => Object.keys(m.sourceData ?? {})))].sort()
    const rows = shown.map((mark) => [
      mark.name,
      mark.slug,
      mark.source,
      mark.website ?? '',
      profileUrl(mark),
      mark.addedAt,
      mark.addedBy,
      ...attributes.map((key) => {
        const value = mark.sourceData?.[key]
        return Array.isArray(value) ? value.join('; ') : (value ?? '')
      }),
    ])
    download(
      `${(list?.name ?? 'list').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${stamp()}.csv`,
      toCsv(
        ['company', 'slug', 'source', 'website', 'profile_url', 'added_at', 'added_by', ...attributes],
        rows,
      ),
    )
  }

  if (loading) {
    return (
      <div className="centered">
        <div className="spinner" />
        <p>Loading list…</p>
      </div>
    )
  }

  if (!list) {
    return (
      <div className="centered">
        <Icon name="alert" />
        <h3>List not found</h3>
        <button type="button" className="btn ghost sm" onClick={onBack}>
          Back to lists
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="page-head split">
        <div style={{ minWidth: 0 }}>
          {renaming ? (
            <div className="headactions" style={{ marginBottom: 6 }}>
              <input
                className="ffind"
                style={{ width: 260, height: 34, margin: 0, fontSize: 15 }}
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && draft.trim()) {
                    onRename(draft.trim())
                    setRenaming(false)
                  }
                  if (e.key === 'Escape') setRenaming(false)
                }}
                aria-label="List name"
              />
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  if (draft.trim()) onRename(draft.trim())
                  setRenaming(false)
                }}
              >
                Save
              </button>
              <button type="button" className="btn ghost sm" onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <h1>{list.name}</h1>
          )}
          <p>
            <span className="tab">{fmt.format(items.length)}</span>{' '}
            {items.length === 1 ? 'company' : 'companies'}
            {sources.length > 0 && <> · from {sources.join(', ')}</>}
          </p>
        </div>

        <div className="headactions">
          <button type="button" className="btn sm" onClick={exportCsv} disabled={!shown.length}>
            <Icon name="download" />
            Export CSV
          </button>
          {!renaming && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setDraft(list.name)
                setRenaming(true)
              }}
            >
              Rename
            </button>
          )}
          {confirmDelete ? (
            <>
              <button
                type="button"
                className="btn danger sm"
                onClick={() => {
                  setConfirmDelete(false)
                  onDelete()
                }}
              >
                Delete list
              </button>
              <button type="button" className="btn ghost sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete list"
            >
              <Icon name="trash" />
            </button>
          )}
        </div>
      </div>

      {!items.length ? (
        <div className="centered">
          <Icon name="bookmark" />
          <h3>Nothing on this list yet</h3>
          <p>Bookmark companies from a source or a collection and pick this list.</p>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <div className="searchwrap grow">
              <Icon name="search" />
              <input
                className="search"
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Search this list…"
                aria-label="Search this list"
              />
              {find && (
                <button
                  type="button"
                  className="clear"
                  onClick={() => setFind('')}
                  aria-label="Clear"
                >
                  <Icon name="x" />
                </button>
              )}
            </div>
          </div>

          <div className="list">
            {shown.map((mark) => (
              <div key={`${mark.source}:${mark.slug}`} className="row static">
                <div className="rowbody">
                  <div className="rowtop">
                    <h3>{mark.name}</h3>
                    {mark.batch && <span className="badge t-accent">{mark.batch}</span>}
                    <span className="badge t-dim">{mark.source}</span>
                  </div>
                  <div className="meta">
                    {mark.website && (
                      <a href={mark.website} target="_blank" rel="noreferrer noopener">
                        {mark.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    )}
                    {mark.website && <span className="dot" />}
                    <span>added by {mark.addedBy}</span>
                  </div>
                </div>
                <div className="rowactions">
                  <a
                    className="btn ghost sm"
                    href={profileUrl(mark)}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Open
                    <Icon name="external" />
                  </a>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => onRemove([{ source: mark.source, slug: mark.slug }])}
                    aria-label={`Remove ${mark.name}`}
                  >
                    <Icon name="x" />
                  </button>
                </div>
              </div>
            ))}
            {!shown.length && (
              <div className="centered">
                <Icon name="empty" />
                <h3>No company matches “{find}”</h3>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
