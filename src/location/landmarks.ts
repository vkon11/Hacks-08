import { campusDirectory } from './campusDirectory.ts'
// Building pins use U-M Facilities footprint centroids. CCTC uses the U-M tour marker.
// The Diag point is the centroid of "The Diag Proper" in Facilities & Operations GIS:
// https://gisapi.fo.umich.edu/arcgis/rest/services/CommonLocations/MapServer/0/524
// Profile IDs stay independent of a future change to the source's URLs or coordinates.
export const LANDMARKS = [
  { id: 'ross', label: 'Ross School of Business', campus: 'Central Campus', lat: 42.272734, lng: -83.737586, aliases: ['ross', 'business school', 'tappan'] },
  { id: 'diag', label: 'The Diag', campus: 'Central Campus', lat: 42.276877, lng: -83.738207, aliases: ['the diag proper', 'block m'] },
  { id: 'michigan-union', label: 'Michigan Union', campus: 'Central Campus', lat: 42.275182, lng: -83.74154, aliases: ['union'] },
  { id: 'cctc', label: 'Central Campus Transit Center', campus: 'Central Campus', lat: 42.278602, lng: -83.733469, aliases: ['cctc', 'bus stop', 'bus station'] },
  { id: 'duderstadt', label: 'Duderstadt Center', campus: 'North Campus', lat: 42.291157, lng: -83.71579, aliases: ['the dude', 'dude', 'dc'] },
  { id: 'pierpont', label: 'Pierpont Commons', campus: 'North Campus', lat: 42.291123, lng: -83.717485, aliases: ['pierpont'] },
] as const

export interface Landmark {
  id: string
  label: string
  campus: string
  lat: number
  lng: number
  aliases: readonly string[]
}

export const campusPlaces: Landmark[] = [...LANDMARKS, ...campusDirectory]
export function findLandmarks(query: string): Landmark[] {
  const words = query.toLowerCase().trim().split(/\s+/)
  if (!words[0]) return [...LANDMARKS]
  return campusPlaces.filter(place => {
    const fields = [place.label, ...place.aliases, place.campus].join(' ').toLowerCase()
    return words.every(word => fields.includes(word))
  }).slice(0, 15)
}
