import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import type { LatLng } from './geo'

/** A position plus direction of travel when the device is moving (degrees from north, m/s). */
export type Fix = LatLng & { heading: number | null; speed: number | null }

const toFix = (c: { latitude: number; longitude: number; heading?: number | null; speed?: number | null }): Fix => ({
  lat: c.latitude,
  lng: c.longitude,
  heading: typeof c.heading === 'number' && Number.isFinite(c.heading) ? c.heading : null,
  speed: typeof c.speed === 'number' && Number.isFinite(c.speed) ? c.speed : null,
})

/**
 * Current position — native GPS in the phone apps, browser geolocation on the web.
 * On the web we ask for a precise fix first, then fall back to a quicker, coarser
 * one (Wi-Fi / cell / a recent fix), which is what Macs and indoor phones can give.
 */
export async function getCurrentLocation(): Promise<Fix> {
  if (Capacitor.isNativePlatform()) {
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 })
      return toFix(pos.coords)
    } catch (e) {
      throw new Error(friendly(e))
    }
  }

  if (!('geolocation' in navigator)) throw new Error('This browser can’t share its location. Pick the spot on the map instead.')
  if (!window.isSecureContext) throw new Error('Location only works over https.')

  try {
    return await browserFix({ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 })
  } catch (e) {
    if (isDenied(e)) throw new Error(friendly(e))
    try {
      return await browserFix({ enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60000 })
    } catch (e2) {
      throw new Error(friendly(e2))
    }
  }
}

function browserFix(opts: PositionOptions): Promise<Fix> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(toFix(p.coords)),
      reject,
      opts,
    ),
  )
}

const isDenied = (e: unknown) =>
  (typeof e === 'object' && e !== null && (e as GeolocationPositionError).code === 1) ||
  /denied|permission/i.test(String((e as Error)?.message ?? e))

function friendly(e: unknown): string {
  const code = (e as GeolocationPositionError)?.code
  const isMac = /Macintosh/.test(navigator.userAgent) && !('ontouchend' in document)
  if (isDenied(e)) {
    return isMac
      ? 'Location is blocked. On a Mac, check System Settings › Privacy & Security › Location Services (for your browser) and the site’s location permission, then try again.'
      : 'Location is blocked. On iPhone: Settings › Privacy & Security › Location Services › Safari Websites › “While Using”, then try again.'
  }
  if (code === 2) {
    return isMac
      ? 'Your Mac couldn’t work out where it is (it uses Wi-Fi for this; hotspots and cellular routers often don’t work). Search for the town instead.'
      : 'Couldn’t get a GPS fix. Try again in a moment, or search for the town instead.'
  }
  if (code === 3) return 'Getting your location took too long. Try again, or search for the town instead.'
  return `Couldn’t get your location (${(e as Error)?.message ?? String(e)}).`
}
