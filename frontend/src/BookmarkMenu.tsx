import { useMemo, useState } from 'react'
import { usePopover } from './FilterMenu'
import { Icon, fmt } from './ui'
import * as api from './api'
import { companyRef } from './bookmarks'
import type { BookmarkList, BookmarkTarget, Membership } from './types'

/**
 * The one bookmark control, used for a single row and for a bulk selection
 * alike. With several targets a list is "all", "some", or "none" of them, and
 * clicking completes the set rather than toggling — the useful move when you're
 * adding 14 companies to a list that already holds 3.
 */
export default function BookmarkMenu({
  targets,
  lists,
  membership,
  onChanged,
  compact = false,
  label,
}: {
  targets: BookmarkTarget[]
  lists: BookmarkList[]
  membership: Membership
  onChanged: () => void
  compact?: boolean
  label?: string
}) {
  const { open, setOpen, ref } = usePopover()
  const [busy, setBusy] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refs = useMemo(() => targets.map((t) => companyRef(t.source, t.slug)), [targets])

  /** How many of the targets each list already holds. */
  const held = useMemo(() => {
    const out: Record<string, number> = {}
    for (const list of lists) {
      out[list.id] = refs.filter((ref) => membership[ref]?.includes(list.id)).length
    }
    return out
  }, [lists, membership, refs])

  const onAnyList = refs.some((ref) => (membership[ref]?.length ?? 0) > 0)

  const apply = async (listId: string) => {
    setBusy(listId)
    setError(null)
    try {
      if (held[listId] === targets.length) {
        await api.removeBookmarks(
          listId,
          targets.map((t) => ({ source: t.source, slug: t.slug })),
        )
      } else {
        await api.addBookmarks(listId, targets)
      }
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the list')
    } finally {
      setBusy(null)
    }
  }

  const create = async () => {
    const name = draft.trim()
    if (!name) return
    setCreating(true)
    setError(null)
    try {
      const list = await api.createList(name)
      await api.addBookmarks(list.id, targets)
      setDraft('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the list')
    } finally {
      setCreating(false)
    }
  }

  const many = targets.length > 1

  return (
    <div className="menuwrap" ref={ref}>
      <button
        type="button"
        className={compact ? (onAnyList ? 'bmk on' : 'bmk') : onAnyList ? 'btn ghost sm on' : 'btn ghost sm'}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-label={many ? `Bookmark ${targets.length} companies` : 'Bookmark'}
        aria-expanded={open}
        title={many ? `Bookmark ${fmt.format(targets.length)} companies` : 'Bookmark'}
      >
        <Icon name="bookmark" fill={onAnyList} />
        {!compact && (label ?? (many ? `Bookmark ${fmt.format(targets.length)}` : 'Bookmark'))}
      </button>

      {open && (
        <div className="menu bookmarks" onClick={(e) => e.stopPropagation()}>
          <div className="menuhead">
            <span>
              {many ? `${fmt.format(targets.length)} companies` : (targets[0]?.name ?? 'Bookmark')}
            </span>
          </div>

          <div className="menulist">
            {lists.map((list) => {
              const count = held[list.id] ?? 0
              const all = count === targets.length
              const some = count > 0 && !all
              return (
                <button
                  key={list.id}
                  type="button"
                  className={all ? 'opt on' : 'opt'}
                  onClick={() => apply(list.id)}
                  disabled={busy === list.id}
                >
                  <span className={some ? 'box some' : 'box'} aria-hidden="true">
                    <Icon name={some ? 'minus' : 'check'} />
                  </span>
                  <span className="txt">{list.name}</span>
                  <span className="n">
                    {many && count > 0 ? `${count}/${targets.length}` : fmt.format(list.count)}
                  </span>
                </button>
              )
            })}
            {!lists.length && <span className="menuempty">No lists yet.</span>}
          </div>

          <div className="menufoot">
            <input
              className="ffind"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="New list…"
              aria-label="New list name"
            />
            <button
              type="button"
              className="btn sm"
              onClick={create}
              disabled={!draft.trim() || creating}
              aria-label="Create list and add"
            >
              {creating ? <div className="spinner light" /> : <Icon name="plus" />}
            </button>
          </div>

          {error && <span className="menuempty" style={{ color: 'var(--red)' }}>{error}</span>}
        </div>
      )}
    </div>
  )
}
