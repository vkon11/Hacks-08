import { supabase } from '../account/client'

export async function requestHousing<T>(
  operation: 'interpret' | 'filter' | 'rank',
  body: unknown,
  signal?: AbortSignal
): Promise<T> {
  const session = (await supabase?.auth.getSession())?.data.session
  if (!session) throw Error('Sign in to continue.')
  const response = await fetch('/api/housing/' + operation, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    cache: 'no-store'
  })
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw Error('The housing service is unavailable. Your work is saved on this device.')
  const data = await response.json()
  if (!response.ok)
    throw Error(
      typeof data.error === 'string' ? data.error : 'The housing service could not finish. Please retry.'
    )
  return data as T
}
