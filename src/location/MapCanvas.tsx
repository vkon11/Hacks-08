import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LocateFixed } from 'lucide-react'
import { inBounds, MAP_BOUNDS } from '../model/inputs'
import type { IdealLocation } from '../model/types'
import { LANDMARKS } from './landmarks'

export interface MapCanvasProps {
  pin: IdealLocation | null
  onPoint: (lat: number, lng: number) => void
  recenter: number
}

const pinIcon = L.divIcon({
  className: 'location-map-pin',
  iconSize: [32, 40],
  iconAnchor: [16, 39],
  html: '<svg aria-hidden="true" width="32" height="40" viewBox="0 0 32 40"><path fill="#e9bc45" stroke="#172d37" stroke-width="2" d="M16 38C13 32 2 22 2 15a14 14 0 0 1 28 0c0 7-11 17-14 23Z"/><circle cx="16" cy="15" r="4.3" fill="#172d37"/></svg>',
})

export default function MapCanvas({ pin, onPoint, recenter }: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.Marker | null>(null)
  const latestPin = useRef(pin)
  const latestOnPoint = useRef(onPoint)
  const lastRecenter = useRef(recenter)
  const [tileFailure, setTileFailure] = useState(false)
  const [outside, setOutside] = useState(false)

  useEffect(() => {
    latestPin.current = pin
    latestOnPoint.current = onPoint
  }, [pin, onPoint])

  useEffect(() => {
    if (!container.current) return
    const bounds = L.latLngBounds([MAP_BOUNDS.south, MAP_BOUNDS.west], [MAP_BOUNDS.north, MAP_BOUNDS.east])
    const instance = L.map(container.current, {
      maxBounds: bounds, maxBoundsViscosity: 1, minZoom: 12, maxZoom: 19,
      scrollWheelZoom: false, doubleClickZoom: false, zoomAnimation: false, fadeAnimation: false,
      markerZoomAnimation: false,
    })
    map.current = instance
    const initial = latestPin.current
    if (initial) instance.setView([initial.lat, initial.lng], 15)
    else instance.fitBounds(L.latLngBounds(LANDMARKS.map(({ lat, lng }) => [lat, lng])), {
      padding: [26, 24], maxZoom: 14,
    })

    const tileUrl = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
    const attribution = import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    const tiles = L.tileLayer(tileUrl, { attribution, maxZoom: 19, noWrap: true })
    const failedTiles = new Set<HTMLElement>()
    tiles.on('tileerror', (event: L.TileErrorEvent) => {
      failedTiles.add(event.tile)
      setTileFailure(true)
    })
    tiles.on('tileunload', (event: L.TileEvent) => { failedTiles.delete(event.tile) })
    tiles.on('load', () => setTileFailure(failedTiles.size > 0))
    tiles.addTo(instance)
    instance.on('click', ({ latlng }: L.LeafletMouseEvent) => {
      setOutside(!inBounds(latlng.lat, latlng.lng))
      if (inBounds(latlng.lat, latlng.lng)) latestOnPoint.current(latlng.lat, latlng.lng)
    })
    const observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }))
    observer.observe(container.current)
    return () => {
      observer.disconnect()
      tiles.off()
      instance.remove()
      map.current = null
      marker.current = null
    }
  }, [])

  useEffect(() => {
    const instance = map.current
    if (!instance || !pin) return
    const position = L.latLng(pin.lat, pin.lng)
    let active = marker.current
    if (!active) {
      active = L.marker(position, { icon: pinIcon, draggable: true, autoPan: true, keyboard: false }).addTo(instance)
      active.getElement()?.setAttribute('role', 'img')
      marker.current = active
      active.on('dragend', () => {
        const current = marker.current
        if (!current) return
        const { lat, lng } = current.getLatLng()
        if (inBounds(lat, lng)) {
          setOutside(false)
          latestOnPoint.current(lat, lng)
        } else {
          setOutside(true)
          const previous = latestPin.current
          if (previous) current.setLatLng([previous.lat, previous.lng])
        }
      })
    }
    active.setLatLng(position)
    active.unbindTooltip()
    if (pin.source === 'landmark') {
      const label = document.createElement('span')
      label.textContent = pin.label
      active.bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -38] }).openTooltip()
    }
    active.getElement()?.setAttribute('aria-label', pin.label)
    if (recenter !== lastRecenter.current) {
      instance.setView(position, Math.max(instance.getZoom(), 17), { animate: false })
      lastRecenter.current = recenter
    }
    setOutside(false)
  }, [pin, recenter])

  return <>
    <div className="location-map-frame">
      <div ref={container} className="location-map" role="region" aria-label="Ann Arbor map" tabIndex={0} />
      <button className="location-center" type="button" onClick={() => {
        const center = map.current?.getCenter()
        if (center && inBounds(center.lat, center.lng)) onPoint(center.lat, center.lng)
      }}><LocateFixed size={17} aria-hidden="true" />Use map center</button>
    </div>
    {tileFailure && <p className="location-notice" role="status">Map unavailable. Choose a campus landmark or enter coordinates.</p>}
    {outside && <p className="location-error" role="alert">Choose a point within the Ann Arbor area.</p>}
  </>
}
