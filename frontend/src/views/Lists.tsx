import { useState } from 'react'
import { Icon, fmt } from '../ui'
import type { BookmarkList } from '../types'

function when(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Named sets of companies, curated by hand rather than filled by a workflow. */
export default function Lists({
  lists,
  loading,
  onOpen,
  onCreate,
}: {
  lists: BookmarkList[]
  loading: boolean
  onOpen: (id: string) => void
  onCreate: (name: string) => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const create = async () => {
    const name = draft.trim()
    if (!name) return
    setBusy(true)
    try {
      await onCreate(name)
      setDraft('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head split">
        <div>
          <h1>Lists</h1>
          <p>Companies you've bookmarked, from any source or collection.</p>
        </div>
        <div className="headactions">
          <input
            className="ffind"
            style={{ width: 180, height: 34, margin: 0 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="New list name…"
            aria-label="New list name"
          />
          <button type="button" className="btn sm" onClick={create} disabled={!draft.trim() || busy}>
            <Icon name="plus" />
            Create
          </button>
        </div>
      </div>

      {loading ? (
        <div className="centered">
          <div className="spinner" />
          <p>Loading lists…</p>
        </div>
      ) : !lists.length ? (
        <div className="centered">
          <Icon name="bookmark" />
          <h3>No lists yet</h3>
          <p>
            Bookmark a company from the Y Combinator list, or bulk-bookmark everyone using a given
            subprocessor. Lists are created as you go.
          </p>
        </div>
      ) : (
        <div className="cards">
          {lists.map((list) => (
            <button key={list.id} type="button" className="card" onClick={() => onOpen(list.id)}>
              <div className="cardtop">
                <span className="tile t-violet">
                  <Icon name="bookmark" fill />
                </span>
                <h3>{list.name}</h3>
              </div>
              <div className="cardfoot">
                <strong className="tab">{fmt.format(list.count)}</strong>
                <span>
                  {list.count === 1 ? 'company' : 'companies'} · created {when(list.createdAt)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
