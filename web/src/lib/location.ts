import { Geolocation } from '@capacitor/geolocation'
import type { LatLng } from './geo'

/** Current position — native GPS in the phone app, browser geolocation on the web. */
export async function getCurrentLocation(): Promise<LatLng> {
  try {
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 })
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(
      /denied|permission/i.test(msg)
        ? 'Location permission is off. Turn it on for Stopover in your settings, or pick the spot on the map.'
        : `Couldn't get your location: ${msg}`,
    )
  }
}
