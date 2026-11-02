import { useState } from 'react'
import { searchPlaces, type Located } from '../lib/geo'

/** Search box that resolves text to a list of map locations. Searches on submit (no autocomplete) to respect the free geocoder's rate limit. */
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

  async function run(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
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
      <form onSubmit={run} className="row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} enterKeyHint="search" />
        <button className="btn" disabled={busy || !q.trim()}>{busy ? '…' : 'Search'}</button>
      </form>
      {err && <p className="error">{err}</p>}
      {results && (
        <ul className="results">
          {results.length === 0 && <li className="muted">No matches. Try adding a city or state.</li>}
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
