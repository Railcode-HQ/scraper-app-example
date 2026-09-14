import { useState } from 'react'
import { Icon, fmt, money } from '../ui'
import type { Run, RunStatus } from '../types'

const TINT: Record<RunStatus, string> = {
  running: 't-accent',
  done: 't-green',
  stopped: 't-amber',
  error: 't-red',
}

function when(iso: string): string {
  const d = new Date(iso)
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** The ledger: what was run, over what, how it went, and what it cost. */
export default function Runs({
  runs,
  loading,
  onStop,
  onResume,
  onDelete,
  onOpenCollection,
  onGoToSource,
}: {
  runs: Run[]
  loading: boolean
  onStop: (id: string) => void
  onResume: (id: string) => void
  onDelete: (id: string) => void
  onOpenCollection: (collection: string) => void
  onGoToSource: () => void
}) {
  const [confirming, setConfirming] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="centered">
        <div className="spinner" />
        <p>Loading runs…</p>
      </div>
    )
  }

  return (
    <>
      <div className="page-head">
        <h1>Runs</h1>
        <p>Every workflow execution, with the filter it was applied to and what it cost.</p>
      </div>

      {!runs.length ? (
        <div className="centered">
          <Icon name="empty" />
          <h3>No runs yet</h3>
          <p>Filter a company list and run a workflow over it to populate a collection.</p>
          <button type="button" className="btn" onClick={onGoToSource}>
            Go to Y Combinator
            <Icon name="arrow" />
          </button>
        </div>
      ) : (
        <div className="list">
          {runs.map((run) => {
            const pct = Math.round((run.cursor / Math.max(run.targetCount, 1)) * 100)
            return (
              <div key={run.id} className="row static">
                <div className="rowbody">
                  <div className="rowtop">
                    <h3>{run.workflowLabel}</h3>
                    <span className={`badge ${TINT[run.status]}`}>{run.status}</span>
                    <span className="badge t-dim">{run.source}</span>
                  </div>

                  <p className="oneliner">{run.filterLabel}</p>

                  <div className="bar" style={{ marginTop: 9 }}>
                    <div className={run.status === 'error' ? 'fill red' : 'fill'} style={{ width: `${pct}%` }} />
                  </div>

                  <div className="meta">
                    <span className="tab">
                      {fmt.format(run.cursor)} / {fmt.format(run.targetCount)}
                    </span>
                    <span className="dot" />
                    <span className="tab">{fmt.format(run.ok)} with results</span>
                    <span className="dot" />
                    <span className="tab">{fmt.format(run.empty)} empty</span>
                    {run.failed > 0 && (
                      <>
                        <span className="dot" />
                        <span className="tab" style={{ color: 'var(--red)' }}>
                          {fmt.format(run.failed)} failed
                        </span>
                      </>
                    )}
                    <span className="dot" />
                    <span className="tab">{money(run.costUsd)}</span>
                    <span className="dot" />
                    <span>
                      {run.createdBy} · {when(run.createdAt)}
                    </span>
                  </div>

                  {run.error && (
                    <div className="banner" style={{ marginTop: 10 }}>
                      <Icon name="alert" />
                      <span>{run.error}</span>
                    </div>
                  )}
                </div>

                <div className="rowactions">
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => onOpenCollection(run.collection)}
                  >
                    Collection
                    <Icon name="arrow" />
                  </button>

                  {run.status === 'running' ? (
                    <button type="button" className="btn ghost sm" onClick={() => onStop(run.id)}>
                      <Icon name="stop" fill />
                      Stop
                    </button>
                  ) : run.cursor < run.targetCount && run.status !== 'error' ? (
                    <button type="button" className="btn ghost sm" onClick={() => onResume(run.id)}>
                      <Icon name="play" fill />
                      Continue
                    </button>
                  ) : null}

                  {confirming === run.id ? (
                    <>
                      <button
                        type="button"
                        className="btn danger sm"
                        onClick={() => {
                          setConfirming(null)
                          onDelete(run.id)
                        }}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => setConfirming(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => setConfirming(run.id)}
                      aria-label="Delete run"
                    >
                      <Icon name="trash" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
