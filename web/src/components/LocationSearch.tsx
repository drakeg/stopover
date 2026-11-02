import { useState } from 'react'
import { parseCoordinates, searchPlaces, type Located } from '../lib/geo'

/**
 * Search box that resolves text to a map location. Pasted coordinates or a
 * maps link apply immediately; text searches show a list to choose from.
 *
 * Deliberately not a <form>: it's used inside other forms (Edit place), and a
 * nested form would make Search submit — and close — the outer one.
 */
export function LocationSearch({
  placeholder,
  onSelect,
}: {
  placeholder: string
  onSelect: (loc: Located) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Located[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [applied, setApplied] = useState<string | null>(null)

  async function run() {
    if (!q.trim() || busy) return
    setErr(null)
    setApplied(null)
    const coords = parseCoordinates(q)
    if (coords) {
      onSelect({ ...coords, label: '' })
      setResults(null)
      setApplied(`Pin moved to ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`)
      return
    }
    setBusy(true)
    try {
      setResults(await searchPlaces(q))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="search">
      <div className="row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault() // don't submit a surrounding form
              run()
            }
          }}
          placeholder={placeholder}
          enterKeyHint="search"
          inputMode="search"
        />
        <button type="button" className="btn" disabled={busy || !q.trim()} onClick={run}>
          {busy ? '…' : 'Go'}
        </button>
      </div>
      {applied && <p className="ok small">✓ {applied}</p>}
      {err && <p className="error">{err}</p>}
      {results && (
        <ul className="results">
          {results.length === 0 && <li className="muted">No matches. Try a nearby town or address, or paste coordinates or a maps link.</li>}
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onSelect(r)
                  setResults(null)
                  setQ(r.label.split(',')[0])
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
