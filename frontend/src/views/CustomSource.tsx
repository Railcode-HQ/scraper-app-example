import { useMemo, useState } from 'react'
import * as api from '../api'
import BookmarkMenu from '../BookmarkMenu'
import { Icon, fmt, money } from '../ui'
import type { AddResult, BookmarkList, CustomCompany, Membership } from '../types'

/** URLs per request. Each costs one Exa call, so batches stay small and visible. */
const CHUNK = 5

/** Accepts a paste of any shape — newlines, commas, or plain spaces. */
const splitUrls = (input: string): string[] => [
  ...new Set(
    input
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  ),
]

const host = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

/**
 * One added company. The note is the only field written by hand rather than
 * extracted, so it's the only one editable here — in place, without a dialog.
 */
function CompanyCard({
  company,
  lists,
  membership,
  onChanged,
  onBookmarked,
}: {
  company: CustomCompany
  lists: BookmarkList[]
  membership: Membership
  onChanged: () => void
  onBookmarked: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(company.note)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const open = () => {
    setDraft(company.note)
    setEditing(true)
  }

  const save = async () => {
    if (saving) return
    if (draft.trim() === company.note) return setEditing(false)
    setSaving(true)
    try {
      await api.setCustomCompanyNote(company.slug, draft.trim())
      setEditing(false)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="row static">
      <div className="rowbody">
        <div className="rowtop">
          <h3>{company.name}</h3>
          <span className="badge t-dim">custom</span>
        </div>
        {company.description && <p className="oneliner">{company.description}</p>}

        {editing ? (
          <div className="noteedit">
            <textarea
              className="urlinput note-input"
              value={draft}
              autoFocus
              rows={3}
              disabled={saving}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false)
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save()
              }}
              placeholder="How you got here — a referral, a search, a conversation…"
              aria-label={`Note on ${company.name}`}
            />
            <div className="noteactions">
              <span className="hint">⌘↵ to save, Esc to cancel</span>
              <button type="button" className="btn ghost sm" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="button" className="btn sm" onClick={save} disabled={saving}>
                {saving ? <div className="spinner light" /> : <Icon name="check" />}
                Save
              </button>
            </div>
          </div>
        ) : (
          company.note && (
            <button type="button" className="note" onClick={open} title="Edit note">
              <Icon name="note" />
              <span>{company.note}</span>
            </button>
          )
        )}

        <div className="meta">
          <a href={company.website} target="_blank" rel="noreferrer noopener">
            {host(company.website)}
          </a>
          <span className="dot" />
          <span>added by {company.addedBy}</span>
          {!editing && !company.note && (
            <>
              <span className="dot" />
              <button type="button" className="linkbtn" onClick={open}>
                Add a note
              </button>
            </>
          )}
        </div>
      </div>

      <BookmarkMenu
        targets={[
          {
            source: 'custom',
            slug: company.slug,
            name: company.name,
            website: company.website,
            batch: '',
            sourceData: {
              description: company.description,
              website: company.website,
              note: company.note,
              added_by: company.addedBy,
            },
          },
        ]}
        lists={lists}
        membership={membership}
        onChanged={onBookmarked}
        compact
      />

      <button
        type="button"
        className="bmk"
        disabled={removing}
        onClick={() => {
          setRemoving(true)
          api
            .removeCustomCompany(company.slug)
            .then(onChanged)
            .finally(() => setRemoving(false))
        }}
        aria-label={`Remove ${company.name}`}
      >
        <Icon name="x" />
      </button>
    </div>
  )
}

/**
 * A source you fill by hand. Paste one website or a hundred; Exa reads each and
 * the company joins the app on the same footing as one from YC. Exa can't know
 * why you went looking, so the note beside the paste box is where that goes.
 */
export default function CustomSource({
  companies,
  total,
  loading,
  query,
  onQuery,
  onChanged,
  onRun,
  canRun,
  lists,
  membership,
  onBookmarked,
}: {
  /** Already filtered by `query`. */
  companies: CustomCompany[]
  total: number
  loading: boolean
  query: string
  onQuery: (next: string) => void
  onChanged: () => void
  onRun: () => void
  canRun: boolean
  lists: BookmarkList[]
  membership: Membership
  onBookmarked: () => void
}) {
  const [input, setInput] = useState('')
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<AddResult | null>(null)

  const pending = useMemo(() => splitUrls(input), [input])

  const submit = async () => {
    if (!pending.length || adding) return
    setAdding(true)
    setResult(null)
    setProgress({ done: 0, total: pending.length })

    // The note belongs to the paste, not the chunk, so every batch carries it.
    const context = note.trim()
    const acc: AddResult = { added: [], skipped: [], failed: [] }
    for (let i = 0; i < pending.length; i += CHUNK) {
      const batch = pending.slice(i, i + CHUNK)
      try {
        const res = await api.addCustomCompanies(batch, context)
        acc.added.push(...res.added)
        acc.skipped.push(...res.skipped)
        acc.failed.push(...res.failed)
      } catch (err) {
        const message = err instanceof Error ? err.message.slice(0, 160) : 'failed'
        acc.failed.push(...batch.map((url) => ({ url, error: message })))
      }
      setProgress({ done: Math.min(i + CHUNK, pending.length), total: pending.length })
      setResult({ ...acc })
      onChanged()
    }

    setAdding(false)
    setInput('')
    setNote('')
  }

  return (
    <>
      <div className="page-head split">
        <div>
          <h1>Custom companies</h1>
          <p>
            {loading
              ? 'Loading…'
              : `${fmt.format(total)} compan${total === 1 ? 'y' : 'ies'} added by hand`}
          </p>
        </div>
        <button type="button" className="btn" onClick={onRun} disabled={!canRun}>
          <Icon name="play" fill />
          Run workflow
        </button>
      </div>

      <div className="addbox">
        <label htmlFor="urls">Add by website</label>
        <textarea
          id="urls"
          className="urlinput"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
          placeholder={'stripe.com\nhttps://linear.app\nresend.com'}
          rows={3}
          disabled={adding}
        />

        <label htmlFor="note" className="spaced">
          Note <span className="optional">optional</span>
        </label>
        <textarea
          id="note"
          className="urlinput note-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
          placeholder="How you got here — a referral, a search, a conversation…"
          rows={2}
          disabled={adding}
        />

        <div className="addfoot">
          <span className="hint">
            {pending.length
              ? `${fmt.format(pending.length)} URL${pending.length === 1 ? '' : 's'} · about ${money(pending.length * 0.005)} to extract${note.trim() ? ' · note goes on each' : ''}`
              : 'One per line, or paste a comma-separated list. The note applies to the whole paste.'}
          </span>
          <button type="button" className="btn sm" onClick={submit} disabled={!pending.length || adding}>
            {adding ? <div className="spinner light" /> : <Icon name="plus" />}
            {adding ? `${progress.done}/${progress.total}` : 'Add'}
          </button>
        </div>

        {adding && (
          <div className="bar" style={{ marginTop: 10 }}>
            <div
              className="fill"
              style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
            />
          </div>
        )}

        {result && (
          <div className="statrow" style={{ marginTop: 12 }}>
            {result.added.length > 0 && (
              <span className="badge t-green">{fmt.format(result.added.length)} added</span>
            )}
            {result.skipped.length > 0 && (
              <span className="badge t-dim">{fmt.format(result.skipped.length)} already here</span>
            )}
            {result.failed.length > 0 && (
              <span className="badge t-red" title={result.failed.map((f) => `${f.url}: ${f.error}`).join('\n')}>
                {fmt.format(result.failed.length)} failed
              </span>
            )}
          </div>
        )}

        {result?.failed.length ? (
          <div className="failures">
            {result.failed.slice(0, 5).map((failure) => (
              <div key={failure.url}>
                <span className="mono">{failure.url}</span> — {failure.error}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="centered">
          <div className="spinner" />
          <p>Loading companies…</p>
        </div>
      ) : !total ? (
        <div className="centered">
          <Icon name="empty" />
          <h3>No companies yet</h3>
          <p>
            Paste a website above. Exa reads it and pulls out the name, a one-line description, and
            the site — the note is yours, for why you went looking.
          </p>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <div className="searchwrap grow">
              <Icon name="search" />
              <input
                className="search"
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder="Search added companies and notes…"
                aria-label="Search added companies and notes"
              />
              {query && (
                <button type="button" className="clear" onClick={() => onQuery('')} aria-label="Clear">
                  <Icon name="x" />
                </button>
              )}
            </div>
          </div>

          <div className="list">
            {companies.map((company) => (
              <CompanyCard
                key={company.slug}
                company={company}
                lists={lists}
                membership={membership}
                onChanged={onChanged}
                onBookmarked={onBookmarked}
              />
            ))}
            {!companies.length && (
              <div className="centered">
                <Icon name="empty" />
                <h3>No company matches “{query}”</h3>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
