import { useEffect } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '../lib/geo'

export type MapPin = LatLng & {
  id: string
  title: string
  subtitle?: string
  kind: 'place' | 'visited' | 'stop' | 'endpoint' | 'draft'
}

const COLORS: Record<MapPin['kind'], string> = {
  place: '#c2410c',
  visited: '#78716c',
  stop: '#c2410c',
  endpoint: '#14532d',
  draft: '#2563eb',
}

function FitBounds({ pins, route }: { pins: MapPin[]; route?: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    const pts: [number, number][] = route?.length
      ? route.map(([lng, lat]) => [lat, lng])
      : pins.map((p) => [p.lat, p.lng])
    if (pts.length === 1) map.setView(pts[0], 12)
    else if (pts.length > 1) map.fitBounds(pts as LatLngBoundsExpression, { padding: [30, 30] })
    // Only refit when the set of things changes, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pins.length, route])
  return null
}

function ClickToPick({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

export function MapView({
  pins,
  route,
  onPick,
  height = 320,
}: {
  pins: MapPin[]
  route?: [number, number][]
  onPick?: (p: LatLng) => void
  height?: number
}) {
  return (
    <div className="map" style={{ height }}>
      <MapContainer center={[39.5, -96]} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {route && (
          <Polyline positions={route.map(([lng, lat]) => [lat, lng] as [number, number])} pathOptions={{ color: '#14532d', weight: 5, opacity: 0.75 }} />
        )}
        {pins.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={p.kind === 'endpoint' ? 9 : 8}
            pathOptions={{ color: '#fff', weight: 2, fillColor: COLORS[p.kind], fillOpacity: 1 }}
          >
            <Popup>
              <strong>{p.title}</strong>
              {p.subtitle && <div className="muted">{p.subtitle}</div>}
            </Popup>
          </CircleMarker>
        ))}
        {onPick && <ClickToPick onPick={onPick} />}
        <FitBounds pins={pins} route={route} />
      </MapContainer>
    </div>
  )
}
