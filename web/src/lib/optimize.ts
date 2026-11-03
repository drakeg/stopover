import { OSRM, type LatLng } from './geo'
import { distanceMi } from './nearby'

/**
 * Best visiting order for a handful of stops.
 *
 * Costs come from real driving times (OSRM table service). The order is solved
 * exactly for up to 12 stops (Held–Karp), and with nearest-neighbour + 2-opt
 * beyond that — plenty for a road trip.
 */

export type EndMode = 'last-stop' | 'back-to-start' | 'fixed'

/** Drive times in seconds between every pair of points (row = from). */
export async function driveTimes(points: LatLng[], signal?: AbortSignal): Promise<number[][]> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const res = await fetch(`${OSRM}/table/v1/driving/${coords}`, { signal })
  if (!res.ok) throw new Error(`Drive-time lookup failed (${res.status})`)
  const data = await res.json()
  if (data.code !== 'Ok' || !Array.isArray(data.durations)) throw new Error(data.message || 'Drive-time lookup failed')
  // null = no road connection found; make it very expensive rather than impossible
  return data.durations.map((row: (number | null)[]) => row.map((v) => (v == null ? 1e9 : v)))
}

/** Fallback when the routing server is unreachable: straight-line miles. */
export const straightLineCosts = (points: LatLng[]) => points.map((a) => points.map((b) => distanceMi(a, b)))

/**
 * Order of stop indices (1..n) minimising total cost.
 * cost is (n+1)×(n+1) for 'last-stop'/'back-to-start' — index 0 is the start —
 * or (n+2)×(n+2) for 'fixed', where index n+1 is the destination.
 */
export function bestOrder(cost: number[][], n: number, end: EndMode): number[] {
  if (n <= 1) return n === 1 ? [1] : []
  const endIdx = end === 'fixed' ? n + 1 : end === 'back-to-start' ? 0 : -1
  const tail = (j: number) => (endIdx < 0 ? 0 : cost[j][endIdx])
  return n <= 12 ? heldKarp(cost, n, tail) : twoOpt(cost, n, tail, nearestNeighbour(cost, n))
}

function heldKarp(cost: number[][], n: number, tail: (j: number) => number): number[] {
  const FULL = 1 << n
  const dp = new Float64Array(FULL * n).fill(Infinity)
  const parent = new Int8Array(FULL * n).fill(-1)
  for (let j = 0; j < n; j++) dp[(1 << j) * n + j] = cost[0][j + 1]
  for (let mask = 1; mask < FULL; mask++) {
    for (let j = 0; j < n; j++) {
      const cur = dp[mask * n + j]
      if (!(mask & (1 << j)) || cur === Infinity) continue
      for (let k = 0; k < n; k++) {
        if (mask & (1 << k)) continue
        const next = mask | (1 << k)
        const c = cur + cost[j + 1][k + 1]
        if (c < dp[next * n + k]) {
          dp[next * n + k] = c
          parent[next * n + k] = j
        }
      }
    }
  }
  let best = Infinity
  let last = 0
  for (let j = 0; j < n; j++) {
    const c = dp[(FULL - 1) * n + j] + tail(j + 1)
    if (c < best) { best = c; last = j }
  }
  const order: number[] = []
  let mask = FULL - 1
  let j = last
  while (j >= 0) {
    order.push(j + 1)
    const pj = parent[mask * n + j]
    mask &= ~(1 << j)
    j = pj
  }
  return order.reverse()
}

function nearestNeighbour(cost: number[][], n: number): number[] {
  const left = new Set(Array.from({ length: n }, (_, i) => i + 1))
  const order: number[] = []
  let at = 0
  while (left.size) {
    let best = -1
    for (const k of left) if (best < 0 || cost[at][k] < cost[at][best]) best = k
    order.push(best)
    left.delete(best)
    at = best
  }
  return order
}

export function pathCost(cost: number[][], order: number[], tail: (j: number) => number): number {
  let c = 0
  let at = 0
  for (const k of order) { c += cost[at][k]; at = k }
  return c + (order.length ? tail(order[order.length - 1]) : 0)
}

function twoOpt(cost: number[][], n: number, tail: (j: number) => number, start: number[]): number[] {
  let order = start
  let best = pathCost(cost, order, tail)
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const cand = [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)]
        const c = pathCost(cost, cand, tail)
        if (c < best - 1e-9) { order = cand; best = c; improved = true }
      }
    }
  }
  return order
}

export type Plan<T> = {
  ordered: T[]
  usedDriveTimes: boolean // false = fell back to straight-line distance
}

/** Puts `stops` in the best order between `start` and the chosen end. */
export async function planOrder<T extends LatLng>(
  start: LatLng, stops: T[], end: EndMode, destination?: LatLng, signal?: AbortSignal,
): Promise<Plan<T>> {
  const points: LatLng[] = [start, ...stops, ...(end === 'fixed' && destination ? [destination] : [])]
  let cost: number[][]
  let usedDriveTimes = true
  try {
    cost = await driveTimes(points, signal)
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    cost = straightLineCosts(points)
    usedDriveTimes = false
  }
  const order = bestOrder(cost, stops.length, end === 'fixed' && !destination ? 'last-stop' : end)
  return { ordered: order.map((i) => stops[i - 1]), usedDriveTimes }
}
