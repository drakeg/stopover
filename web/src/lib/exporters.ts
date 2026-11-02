import type { Place } from './supabase'

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** GPX waypoints — opens in Garmin (incl. RV GPS units), Gaia, OsmAnd, Google Earth, etc. */
export function placesToGpx(places: Place[]): string {
  const wpts = places.map((p) => {
    const desc = [p.near, p.category, p.notes, p.approximate ? '(approximate location)' : null].filter(Boolean).join(' — ')
    return [
      `  <wpt lat="${p.lat}" lon="${p.lng}">`,
      `    <name>${xml(p.name)}</name>`,
      desc ? `    <desc>${xml(desc)}</desc>` : null,
      p.category ? `    <type>${xml(p.category)}</type>` : null,
      '  </wpt>',
    ].filter(Boolean).join('\n')
  })
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Stopover" xmlns="http://www.topografix.com/GPX/1/1">
${wpts.join('\n')}
</gpx>
`
}

const CSV_COLUMNS = ['name', 'near', 'category', 'notes', 'address', 'lat', 'lng', 'approximate', 'visited', 'visited_at', 'created_at'] as const

/** Spreadsheet-friendly export (Excel, Numbers, Google Sheets). */
export function placesToCsv(places: Place[]): string {
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v)
    // Quote anything with commas/quotes/newlines; neutralise leading =,+,-,@ so spreadsheets don't run it as a formula.
    const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  return [CSV_COLUMNS.join(','), ...places.map((p) => CSV_COLUMNS.map((c) => cell(p[c])).join(','))].join('\r\n') + '\r\n'
}

export function download(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
