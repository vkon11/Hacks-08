import type { SearchSetup, TravelMode } from '../src/ideal/contracts.ts'

export interface RouteEstimate {
  minutes: number
  basis: string
  sourceUrl: string
  checkedAt: string
}

interface Coordinates { lat: number; lng: number }
export type RouteLookup = (origin: Coordinates, setup: SearchSetup, signal?: AbortSignal) => Promise<RouteEstimate | null>

const directModes = { walk: 'WALK', bike: 'BICYCLE', car: 'CAR' } as const
const modeLabels: Record<TravelMode, string> = { walk: 'Walking route', bike: 'Cycling route', car: 'Driving route', bus: 'Bus route' }
const options: Intl.DateTimeFormatOptions = { timeZone: 'America/Detroit' }
const routeDate = new Intl.DateTimeFormat('en-CA', { ...options, year: 'numeric', month: '2-digit', day: '2-digit' })
const routeOffset = new Intl.DateTimeFormat('en', { ...options, timeZoneName: 'longOffset' })

const query = `
  query Commute($origin: PlanLabeledLocationInput!, $destination: PlanLabeledLocationInput!,
    $modes: PlanModesInput!, $dateTime: PlanDateTimeInput) {
    planConnection(origin: $origin, destination: $destination, modes: $modes, dateTime: $dateTime, first: 4) {
      edges { node { duration end legs { mode } } }
    }
  }
`

/** Use a representative upcoming morning while respecting the Detroit daylight offset. */
export function representativeDeparture(now: Date): { date: string; iso: string } {
  const day = new Date(routeDate.format(now) + 'T12:00:00Z')
  do day.setUTCDate(day.getUTCDate() + 1)
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6)
  const date = day.toISOString().slice(0,10)
  const offset = routeOffset.formatToParts(day).find(part => part.type === 'timeZoneName')?.value.replace('GMT', '') || '-05:00'
  return { date, iso: date + 'T08:30:00' + offset }
}

interface Itinerary { duration: number; end: string; legs: { mode: string }[] }
interface OtpResponse {
  data?: { planConnection?: { edges?: { node?: Itinerary }[] } }
  errors?: unknown[]
}

export function createOtpLookup(endpoint = process.env.OTP_GRAPHQL_URL, request = fetch, now = () => new Date()): RouteLookup | undefined {
  if (!endpoint?.trim()) return undefined
  return async (origin, setup, signal) => {
    const mode = setup.travelModes[0]
    const timestamp = now()
    const departure = mode === 'bus' ? representativeDeparture(timestamp) : null
    const coordinate = ({ lat, lng }: Coordinates) => ({ location: { coordinate: { latitude: lat, longitude: lng } } })
    const modes = mode === 'bus'
      ? { transitOnly: true, transit: { access: ['WALK'], egress: ['WALK'], transfer: ['WALK'], transit: [{ mode: 'BUS' }] } }
      : { directOnly: true, direct: [directModes[mode]] }
    const timeout = AbortSignal.timeout(4500)
    const response = await request(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: JSON.stringify({
        query, variables: {
          origin: coordinate(origin), destination: coordinate(setup.pin), modes,
          dateTime: departure ? { earliestDeparture: departure.iso } : null,
        },
      }),
    })
    if (!response.ok) throw new Error('Routing service is unavailable')
    const payload = await response.json() as OtpResponse
    if (payload.errors?.length) throw new Error('Routing service did not accept the request')
    const durations = (payload.data?.planConnection?.edges ?? []).flatMap(({ node }) => {
      if (!node || !Number.isFinite(node.duration) || node.duration < 0) return []
      if (mode !== 'bus') return [node.duration]
      if (!node.legs?.some(leg => leg.mode === 'BUS')) return []
      const elapsed = (Date.parse(node.end) - Date.parse(departure!.iso)) / 1000
      return Number.isFinite(elapsed) && elapsed >= node.duration ? [elapsed] : []
    })
    if (!durations.length) return null
    return {
      minutes: Math.min(...durations) / 60,
      basis: departure ? 'Scheduled bus route departing at 8:30 a.m. ET on ' + departure.date : modeLabels[mode],
      sourceUrl: 'https://docs.opentripplanner.org/',
      checkedAt: timestamp.toISOString(),
    }
  }
}
