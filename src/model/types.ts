export type Step = 'budget' | 'location' | 'essentials' | 'builder'
export type TravelMode = 'walk' | 'car' | 'bus' | 'bike'

export interface IdealLocation {
  lat: number
  lng: number
  source: 'landmark' | 'map' | 'coordinates'
  landmarkId: string | null
  label: string
}
