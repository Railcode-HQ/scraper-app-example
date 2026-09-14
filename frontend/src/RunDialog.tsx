import { useEffect, useState } from 'react'
import { Icon, fmt, money } from './ui'
import type { WorkflowInfo } from './types'

/**
 * The step between "I have a filtered list" and "go spend money on it". It has
 * one job beyond picking a workflow: show what the run will cost before it runs.
 */
export default function RunDialog({
  workflows,
  matched,
  reachable,
  filterLabel,
  starting,
  error,
  onStart,
  onClose,
}: {
  workflows: WorkflowInfo[]
  /** Everything the filter matches. */
  matched: number
  /** What the source will actually hand over for this filter. */
  reachable: number
  filterLabel: string
  starting: boolean
  error: string | null
  onStart: (workflowId: string, limit: number) => void
  onClose: () => void
}) {
  const [workflowId, setWorkflowId] = useState(workflows[0]?.id ?? '')
  const ceiling = reachable
  const [limit, setLimit] = useState(ceiling)

  useEffect(() => setLimit(reachable), [reachable])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !starting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, starting])

  const workflow = workflows.find((w) => w.id === workflowId)
  const count = Math.min(Math.max(limit || 0, 1), ceiling)
  const estimate = (workflow?.costPerCompany ?? 0) * count

  return (
    <>
      <div className="scrim" onClick={() => !starting && onClose()} />
      <div className="modal" role="dialog" aria-modal="true" aria-label="Run a workflow">
        <div className="mhead">
          <h2>Run a workflow</h2>
          <button type="button" className="iconbtn shown" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>

        <div className="mbody">
          <div className="field">
            <label htmlFor="wf">Workflow</label>
            <select
              id="wf"
              className="sel wide"
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
            >
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
            {workflow && <p className="hint">{workflow.description}</p>}
          </div>

          <div className="field">
            <label>Applied to</label>
            <div className="readout">{filterLabel}</div>
            <p className="hint">
              {fmt.format(matched)} compan{matched === 1 ? 'y' : 'ies'} match this filter
              {reachable < matched
                ? ` — the source will hand over the first ${fmt.format(reachable)}.`
                : '.'}
            </p>
          </div>

          <div className="field">
            <label htmlFor="limit">How many to process</label>
            <input
              id="limit"
              className="ffind wide"
              type="number"
              min={1}
              max={ceiling}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
            <p className="hint">Taken from the top of the current sort.</p>
          </div>

          <div className="estimate">
            <div>
              <span className="k">Estimated cost</span>
              <strong className="tab">{money(estimate)}</strong>
            </div>
            <div>
              <span className="k">Lands in</span>
              <strong>{workflow?.collectionLabel ?? '—'}</strong>
            </div>
          </div>

          {error && (
            <div className="banner">
              <Icon name="alert" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="mfoot">
          <button type="button" className="btn ghost" onClick={onClose} disabled={starting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onStart(workflowId, count)}
            disabled={starting || !workflow || count < 1}
          >
            {starting ? (
              <>
                <div className="spinner light" />
                Starting…
              </>
            ) : (
              <>
                <Icon name="play" fill />
                Run on {fmt.format(count)}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
