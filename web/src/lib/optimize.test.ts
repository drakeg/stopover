import { afterEach, describe, expect, it, vi } from 'vitest'
import { bestOrder, pathCost, planOrder, straightLineCosts } from './optimize'

// Points on a line: start at 0, stops at 10, 20, 30, 40 (deliberately listed out of order)
const xs = [0, 30, 10, 40, 20]
const lineCost = xs.map((a) => xs.map((b) => Math.abs(a - b)))

/** Brute force over every permutation, to check the solver against. */
function bruteForce(cost: number[][], n: number, tail: (j: number) => number): number {
  const perms = (arr: number[]): number[][] =>
    arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]))
  return Math.min(...perms(Array.from({ length: n }, (_, i) => i + 1)).map((o) => pathCost(cost, o, tail)))
}

describe('bestOrder', () => {
  it('visits stops along a line in order when ending at the last stop', () => {
    expect(bestOrder(lineCost, 4, 'last-stop').map((i) => xs[i])).toEqual([10, 20, 30, 40])
  })

  it('handles a fixed destination in the middle of the stops', () => {
    // destination at 25: best is to go out to the far end and come back… or the reverse; cost must be optimal
    const ys = [0, 30, 10, 40, 20, 25]
    const cost = ys.map((a) => ys.map((b) => Math.abs(a - b)))
    const order = bestOrder(cost, 4, 'fixed')
    expect(pathCost(cost, order, (j) => cost[j][5])).toBe(bruteForce(cost, 4, (j) => cost[j][5]))
  })

  it('matches brute force on random asymmetric drive times', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let trial = 0; trial < 20; trial++) {
      const n = 3 + (trial % 5) // 3..7 stops
      const size = n + 2
      const cost = Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => (i === j ? 0 : 10 + rnd() * 100)))
      for (const end of ['last-stop', 'back-to-start', 'fixed'] as const) {
        const tail = (j: number) => (end === 'fixed' ? cost[j][n + 1] : end === 'back-to-start' ? cost[j][0] : 0)
        const got = bestOrder(cost, n, end)
        expect([...got].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1))
        expect(pathCost(cost, got, tail)).toBeCloseTo(bruteForce(cost, n, tail), 6)
      }
    }
  })

  it('handles 15 stops with the fast method and still visits each once', () => {
    const pts = Array.from({ length: 16 }, (_, i) => ({ lat: 35 + Math.sin(i) , lng: -85 + Math.cos(i * 1.7) }))
    const order = bestOrder(straightLineCosts(pts), 15, 'last-stop')
    expect(new Set(order).size).toBe(15)
  })

  it('trivial cases', () => {
    expect(bestOrder([[0]], 0, 'last-stop')).toEqual([])
    expect(bestOrder([[0, 1], [1, 0]], 1, 'back-to-start')).toEqual([1])
  })
})

describe('planOrder', () => {
  afterEach(() => vi.unstubAllGlobals())
  const start = { lat: 36.0, lng: -86.0 }
  const stops = [
    { lat: 36.0, lng: -84.0, name: 'far' },
    { lat: 36.0, lng: -85.5, name: 'near' },
    { lat: 36.0, lng: -85.0, name: 'middle' },
  ]

  it('uses drive times from the routing server', async () => {
    // Pretend roads make "middle" a long detour: start→middle is very slow
    const durations = [
      [0, 300, 100, 900],
      [300, 0, 200, 150],
      [100, 200, 0, 50],
      [900, 150, 50, 0],
    ]
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'Ok', durations }) })
    vi.stubGlobal('fetch', fetchMock)
    const plan = await planOrder(start, stops, 'last-stop')
    expect(fetchMock.mock.calls[0][0]).toContain('/table/v1/driving/-86,36;-84,36;-85.5,36;-85,36')
    expect(plan.usedDriveTimes).toBe(true)
    expect(plan.ordered.map((s) => s.name)).toEqual(['near', 'middle', 'far'])
  })

  it('falls back to straight-line distance if the server is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const plan = await planOrder(start, stops, 'last-stop')
    expect(plan.usedDriveTimes).toBe(false)
    expect(plan.ordered.map((s) => s.name)).toEqual(['near', 'middle', 'far'])
  })
})
