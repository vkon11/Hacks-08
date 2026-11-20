import type { Step } from '../model/types'

export type Route = Step | 'home' | 'saved' | 'board'
export const steps: Step[] = ['budget', 'location', 'essentials', 'builder']
export const stepNames: Record<Step, string> = {
  budget: 'Budget',
  location: 'Location & travel',
  essentials: 'Requirements',
  builder: 'Housing brief'
}
export const routePath = (route: Route) => (route === 'home' ? '/' : '/preferences/' + route)
export function currentRoute(): Route {
  const path = window.location.pathname.replace(/\/$/, '')
  return ([...steps, 'saved', 'board'] as Route[]).find((route) => routePath(route) === path) ?? 'board'
}
export function guardRoute(requested: Route, missing: Step, hasSnapshot: boolean): Exclude<Route, 'board'> {
  if (requested === 'board') return missing
  if (requested === 'saved') return hasSnapshot ? 'saved' : missing
  if (requested === 'home') return 'home'
  return steps.indexOf(requested) > steps.indexOf(missing) ? missing : requested
}
