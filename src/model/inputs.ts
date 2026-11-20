import type { TravelMode } from './types.ts'

export const DEFAULT_BUDGET = 1500
export const INITIAL_SLIDER_MAX = 4000
const SLIDER_INCREMENT = 500
export const MAP_BOUNDS = { south: 42.18, north: 42.38, west: -83.88, east: -83.60 } as const
export const TRAVEL_MODES: TravelMode[] = ['walk', 'car', 'bus', 'bike']
export const TRAVEL_LABELS: Record<TravelMode, string> = { walk: 'Walk', car: 'Car', bus: 'Bus', bike: 'Bike' }

export function parseBudgetCents(input: string): number | null {
  if (!/^\d+$/.test(input.trim())) return null
  const cents = Number(input.trim()) * 100
  return Number.isSafeInteger(cents) ? cents : null
}

export function sliderMax(input: string): number {
  const dollars = (parseBudgetCents(input) ?? 0) / 100
  return Math.max(INITIAL_SLIDER_MAX, Math.ceil(dollars / SLIDER_INCREMENT) * SLIDER_INCREMENT)
}

export function inBounds(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && lat >= MAP_BOUNDS.south && lat <= MAP_BOUNDS.north
    && Number.isFinite(lng) && lng >= MAP_BOUNDS.west && lng <= MAP_BOUNDS.east
}

export function isTravelPrefix(value: unknown): value is TravelMode[] {
  return Array.isArray(value) && value.length <= TRAVEL_MODES.length
    && value.every(mode => TRAVEL_MODES.includes(mode)) && new Set(value).size === value.length
}

export function isCompleteRanking(value: unknown): value is [TravelMode, TravelMode, TravelMode, TravelMode] {
  return isTravelPrefix(value) && value.length === TRAVEL_MODES.length
}

export function pickMode(picks: TravelMode[], mode: TravelMode): TravelMode[] {
  if (picks.includes(mode)) return picks
  const next = [...picks, mode]
  if (next.length === TRAVEL_MODES.length - 1) {
    next.push(TRAVEL_MODES.find(remaining => !next.includes(remaining))!)
  }
  return next
}

export function undoMode(picks: TravelMode[]): TravelMode[] {
  return picks.slice(0, picks.length === TRAVEL_MODES.length ? -2 : -1)
}
