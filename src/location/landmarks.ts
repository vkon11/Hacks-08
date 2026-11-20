// Five points use the University's tour markers from https://tour.umich.edu/locations.json.
// The Diag point is the centroid of "The Diag Proper" in Facilities & Operations GIS:
// https://gisapi.fo.umich.edu/arcgis/rest/services/CommonLocations/MapServer/0/524
// Profile IDs stay independent of a future change to the source's URLs or coordinates.
export const LANDMARKS = [
  { id: 'ross', label: 'Ross School of Business', campus: 'Central Campus', lat: 42.273676, lng: -83.737851, aliases: ['ross', 'business school', 'tappan'] },
  { id: 'diag', label: 'The Diag', campus: 'Central Campus', lat: 42.276877, lng: -83.738207, aliases: ['the diag proper', 'block m'] },
  { id: 'michigan-union', label: 'Michigan Union', campus: 'Central Campus', lat: 42.275295, lng: -83.741128, aliases: ['union'] },
  { id: 'cctc', label: 'Central Campus Transit Center', campus: 'Central Campus', lat: 42.278602, lng: -83.733469, aliases: ['cctc', 'bus stop', 'bus station'] },
  { id: 'duderstadt', label: 'Duderstadt Center', campus: 'North Campus', lat: 42.291782, lng: -83.715825, aliases: ['the dude', 'dude', 'dc'] },
  { id: 'pierpont', label: 'Pierpont Commons', campus: 'North Campus', lat: 42.291697, lng: -83.717335, aliases: ['pierpont'] },
] as const

export type Landmark = (typeof LANDMARKS)[number]

export function findLandmarks(query: string) {
  const term = query.trim().toLowerCase()
  return LANDMARKS.filter(({ label, campus, aliases }) =>
    [label, campus, ...aliases].some(name => name.toLowerCase().includes(term)),
  )
}
