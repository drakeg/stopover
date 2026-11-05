import type { DuplicateHit } from '../lib/duplicates'
import type { List } from '../lib/lists'
import type { Place } from '../lib/supabase'

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '')

/** "You already have this" — shown instead of saving until they choose. */
export function DuplicateWarning({ hits, lists, busy, onOpen, onSaveAnyway, onBack }: {
  hits: DuplicateHit[]
  lists: List[]
  busy?: boolean
  onOpen: (p: Place) => void
  onSaveAnyway: () => void
  onBack: () => void
}) {
  const listName = (id: string) => lists.find((l) => l.id === id)?.name
  return (
    <div className="dup" role="alert">
      <strong>{hits.length === 1 ? 'Looks like you already have this one:' : 'Looks like you already have these:'}</strong>
      <ul>
        {hits.slice(0, 3).map(({ place: p, distanceMi }) => (
          <li key={p.id}>
            <div className="grow">
              <div className="name">{p.name}</div>
              <div className="muted small">
                {[
                  p.visited ? `✓ Been there${p.visited_at ? ` ${fmt(p.visited_at)}` : ''}` : 'Still to visit',
                  listName(p.list_id) ? `in “${listName(p.list_id)}”` : null,
                  distanceMi >= 0.1 ? `${distanceMi < 10 ? distanceMi.toFixed(1) : Math.round(distanceMi)} mi away` : null,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button type="button" className="btn small" onClick={() => onOpen(p)}>Open it</button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" className="btn" onClick={onBack} disabled={busy}>Back</button>
        <button type="button" className="btn grow" onClick={onSaveAnyway} disabled={busy}>
          {busy ? 'Saving…' : 'It’s a different place — save it'}
        </button>
      </div>
    </div>
  )
}
