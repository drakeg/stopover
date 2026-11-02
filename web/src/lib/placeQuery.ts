import type { Place } from './supabase'

export const REGION_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico',
  // Canadian provinces/territories ("CA-" prefix keeps them apart from California)
  'CA-AB': 'Alberta', 'CA-BC': 'British Columbia', 'CA-MB': 'Manitoba', 'CA-NB': 'New Brunswick',
  'CA-NL': 'Newfoundland and Labrador', 'CA-NS': 'Nova Scotia', 'CA-NT': 'Northwest Territories', 'CA-NU': 'Nunavut',
  'CA-ON': 'Ontario', 'CA-PE': 'Prince Edward Island', 'CA-QC': 'Quebec', 'CA-SK': 'Saskatchewan', 'CA-YT': 'Yukon',
}

/** Key used for state filtering; Canadian provinces are country-prefixed so "CA" (California) stays unique. */
export const regionKey = (p: Pick<Place, 'state' | 'country'>) =>
  !p.state ? '' : p.country && p.country !== 'US' ? `${p.country}-${p.state}` : p.state

export const regionName = (key: string) => REGION_NAMES[key] ?? key

export type Status = 'all' | 'to-visit' | 'visited'
export type SortKey = 'newest' | 'oldest' | 'name' | 'state'

export type PlaceQuery = {
  text: string
  region: string // '' = any
  category: string // '' = any
  status: Status
  approximateOnly: boolean
  sort: SortKey
}

export const EMPTY_QUERY: PlaceQuery = { text: '', region: '', category: '', status: 'all', approximateOnly: false, sort: 'newest' }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function queryPlaces(places: Place[], q: PlaceQuery): Place[] {
  const words = norm(q.text).split(/\s+/).filter(Boolean)
  const out = places.filter((p) => {
    if (q.region && regionKey(p) !== q.region) return false
    if (q.category && (p.category ?? '') !== q.category) return false
    if (q.status === 'to-visit' && p.visited) return false
    if (q.status === 'visited' && !p.visited) return false
    if (q.approximateOnly && !p.approximate) return false
    if (!words.length) return true
    const hay = norm([p.name, p.near, p.notes, p.city, p.address, p.category, regionName(regionKey(p))].filter(Boolean).join(' '))
    return words.every((w) => hay.includes(w))
  })
  const byName = (a: Place, b: Place) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  const sorters: Record<SortKey, (a: Place, b: Place) => number> = {
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    oldest: (a, b) => a.created_at.localeCompare(b.created_at),
    name: byName,
    // Places without a state go last
    state: (a, b) =>
      (regionKey(a) ? 0 : 1) - (regionKey(b) ? 0 : 1) ||
      regionName(regionKey(a)).localeCompare(regionName(regionKey(b))) ||
      (a.city ?? '').localeCompare(b.city ?? '') ||
      byName(a, b),
  }
  return out.sort(sorters[q.sort])
}

/** States present in the list, with counts, A–Z by name. */
export function regionOptions(places: Place[]): { key: string; label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of places) {
    const k = regionKey(p)
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts].map(([key, count]) => ({ key, label: regionName(key), count })).sort((a, b) => a.label.localeCompare(b.label))
}

export function categoryOptions(places: Place[]): { key: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of places) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key))
}
