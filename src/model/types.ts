export type Step = 'budget' | 'location' | 'board'
export type TravelMode = 'walk' | 'car' | 'bus' | 'bike'
export type Mode = TravelMode
export type Lane = 'must' | 'want' | 'avoid' | 'forbid'
export type Value = true | number | string

export interface IdealLocation {
  lat: number
  lng: number
  source: 'landmark' | 'map' | 'coordinates'
  landmarkId: string | null
  label: string
}

export interface Factor {
  id: string
  label: string
  topic: string
  options: { value: Value; label: string }[]
}

export interface Placement {
  id: string
  value: Value
  lane: Lane
  starred: boolean
}

export interface WeightedFactor extends Placement {
  rank: number
  rule: 'require' | 'forbid' | 'soft'
  signedWeight: number | null
}

/** Versioned handoff to the floor-plan matcher. Soft ranks restart for each strength group. */
export interface PreferenceProfileV1 {
  schemaVersion: 1
  weightPolicyVersion: 'category-rank-v1'
  catalogVersion: 'umich-factors-v1'
  profileId: string
  status: 'complete'
  updatedAt: string
  budget: { maxMonthlyCents: number; currency: 'USD'; basis: 'per_person' }
  idealLocation: IdealLocation
  rankedTravelModes: TravelMode[]
  factors: WeightedFactor[]
}

export interface Draft {
  profileId: string
  started: boolean
  step: Step
  editing: Step | null
  budgetInput: string
  budgetConfirmed: boolean
  idealLocation: IdealLocation | null
  rankedTravelModes: TravelMode[]
  locationConfirmed: boolean
  placements: Placement[]
}

export interface GuestRecord {
  version: 1
  draft: Draft
  completed: PreferenceProfileV1 | null
}
