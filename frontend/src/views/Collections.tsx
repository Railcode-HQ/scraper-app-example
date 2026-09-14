import { Icon, fmt } from '../ui'
import type { CollectionSummary } from '../types'

function when(iso: string | null): string {
  if (!iso) return 'never run'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'updated today'
  if (days === 1) return 'updated yesterday'
  if (days < 30) return `updated ${days} days ago`
  return `updated ${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

/** Every collection a workflow can write into, whether or not it has rows yet. */
export default function Collections({
  collections,
  loading,
  onOpen,
}: {
  collections: CollectionSummary[]
  loading: boolean
  onOpen: (name: string) => void
}) {
  return (
    <>
      <div className="page-head">
        <h1>Collections</h1>
        <p>Datasets built by running a workflow over a filtered company list.</p>
      </div>

      {loading ? (
        <div className="centered">
          <div className="spinner" />
          <p>Loading collections…</p>
        </div>
      ) : (
        <div className="cards">
          {collections.map((collection) => (
            <button
              key={collection.name}
              type="button"
              className="card"
              onClick={() => onOpen(collection.name)}
            >
              <div className="cardtop">
                <span className="tile t-accent">
                  <Icon name="layers" />
                </span>
                <h3>{collection.label}</h3>
              </div>
              <p>{collection.description}</p>
              <div className="cardfoot">
                <strong className="tab">{fmt.format(collection.companies)}</strong>
                <span>
                  {collection.companies === 1 ? 'company' : 'companies'} · {when(collection.updatedAt)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
