import { supabase } from '../account/client'

// Above the server's slowest path (routes, model assessment and research), so only a stalled request trips it.
export const REQUEST_TIMEOUT_MS = 120_000
export const TIMEOUT_MESSAGE =
  'The housing service took too long to answer. Your work is saved. Please retry.'

export async function requestHousing<T>(
  operation: 'interpret' | 'filter' | 'rank',
  body: unknown,
  signal?: AbortSignal,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<T> {
  // One deadline covers the session check and the request, so a stall at either step ends in a retryable error.
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), timeoutMs)
  const stop = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal
  const untilStopped = <V>(work: Promise<V>) =>
    new Promise<V>((resolve, reject) => {
      const onStop = () => reject(stop.reason)
      if (stop.aborted) return onStop()
      stop.addEventListener('abort', onStop, { once: true })
      work.then(resolve, reject).finally(() => stop.removeEventListener('abort', onStop))
    })
  let response: Response, data: { error?: unknown }
  try {
    const session = (await untilStopped(supabase?.auth.getSession() ?? Promise.resolve(null)))?.data.session
    if (!session) throw Error('Sign in to continue.')
    response = await fetch('/api/housing/' + operation, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: stop,
      cache: 'no-store'
    })
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw Error('The housing service is unavailable. Your work is saved on this device.')
    data = await untilStopped(response.json())
  } catch (e) {
    if (deadline.signal.aborted && !signal?.aborted) throw Error(TIMEOUT_MESSAGE)
    throw e
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok)
    throw Error(
      typeof data.error === 'string' ? data.error : 'The housing service could not finish. Please retry.'
    )
  return data as T
}
