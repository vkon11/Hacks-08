import type { Step } from '../model'

export type Route = Step | 'home' | 'saved'
export const steps: Step[] = ['budget', 'location', 'board']
export const stepNames: Record<Step, string> = { budget: 'Budget', location: 'Location & travel', board: 'Priorities' }

export function routePath(route: Route) {
  return route === 'home' ? '/' : '/preferences/' + route
}

export function currentRoute(): Route {
  const path = window.location.pathname.replace(/\/$/, '')
  return ([...steps, 'saved'] as Route[]).find(route => routePath(route) === path) ?? 'home'
}

export function guardRoute(requested: Route, missing: Step, hasSnapshot: boolean): Route {
  if (requested === 'saved') return hasSnapshot ? 'saved' : missing
  if (requested === 'home') return 'home'
  return steps.indexOf(requested) > steps.indexOf(missing) ? missing : requested
}
