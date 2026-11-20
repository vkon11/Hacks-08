import { inBounds, MAP_BOUNDS } from '../model/inputs'
import type { Landmark } from './landmarks'

const cache = new Map<string, Landmark[]>()
let lastRequest = 0

export async function searchAnnArbor(query: string): Promise<Landmark[]> {
  const key = query.trim().toLowerCase()
  const cached = cache.get(key)
  if (cached) return cached
  if (Date.now() - lastRequest < 1100) throw new Error('Please wait a moment and search again.')
  lastRequest = Date.now()
  const { west, north, east, south } = MAP_BOUNDS
  const url = new URL(import.meta.env.VITE_PLACE_SEARCH_URL || 'https://nominatim.openstreetmap.org/search')
  url.search = new URLSearchParams({ q: key, viewbox: [west, north, east, south].join(','), bounded: '1', format: 'jsonv2', limit: '8' }).toString()
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('Online search is unavailable. Try the campus results or tap the map.')
  const rows = await response.json() as { osm_type: string; osm_id: number; lat: string; lon: string; name: string; display_name: string }[]
  const places = rows.filter(row => inBounds(Number(row.lat), Number(row.lon)) && /^(node|way|relation)$/.test(row.osm_type) && Number.isSafeInteger(row.osm_id))
    .map(row => ({ id: 'osm-' + row.osm_type + '-' + row.osm_id, label: row.name || row.display_name.split(',')[0], campus: row.display_name.split(',').slice(1, 3).join(',').trim(), lat: Number(row.lat), lng: Number(row.lon), aliases: [] }))
  cache.set(key, places)
  return places
}
