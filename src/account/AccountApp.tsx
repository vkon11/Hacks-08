import { lazy, Suspense, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Home from '../app/Home'
const Journey = lazy(() => import('../app/App'))
const Dashboard = lazy(() => import('./Dashboard'))
const TimelinePage = lazy(() => import('../timeline/TimelinePage'))
import { supabase } from './client'

export default function AccountApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const path = location.pathname.replace(/\/$/, '') || '/'
  const home = path === '/'
  const timeline = path === '/timeline' // public, like home
  const questionnaire = path.startsWith('/preferences/')
  const authPage = path === '/login' || path === '/auth/callback'
  const user = session?.user
  const eligible = !!user?.email?.toLowerCase().endsWith('@umich.edu')

  useEffect(() => {
    if (home) document.title = 'Which Ann Arbor apartment fits the way you live? · Ann Arbor Housing Board'
    else if (!questionnaire && !timeline) document.title = (authPage ? 'Sign in' : 'Your dashboard') + ' · Ann Arbor Housing Board'
  }, [home, timeline, questionnaire, authPage])

  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((_event, current) => {
      setSession(current)
      setReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!ready || home || timeline) return
    if (authPage && eligible) location.replace('/dashboard')
    else if (!authPage && !eligible) location.replace('/login')
  }, [ready, home, timeline, questionnaire, authPage, eligible])

  async function signIn() {
    if (!supabase) return
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: {
        redirectTo: location.origin + '/auth/callback', queryParams: { hd: 'umich.edu', prompt: 'select_account' },
      } })
      if (error) throw error
    } catch { setError('Google sign-in could not start. Please try again.'); setBusy(false) }
  }
  async function signOut() {
    if (!supabase) return
    setBusy(true)
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
      location.replace('/')
    } catch { setError('Could not sign out. Please try again.'); setBusy(false) }
  }
  return <>
    <header className="top-bar"><div className="header-inner">
      <a className="brand" href="/"><img src="/housing-board.svg" alt=""/><span>Ann Arbor Housing Board</span></a>
      <nav className="account-nav">{home && <a href="#how-it-works">How it works</a>}
        {eligible && !home && path !== '/dashboard' && <a href="/dashboard">Dashboard</a>}
        {session && <button className="text-button" disabled={busy} onClick={signOut}>Sign out</button>}
      </nav></div></header>
    {error && <p className="storage-error" role="alert">{error}</p>}
    <Suspense fallback={<p className="summary view" role="status">Loading…</p>}>
    {home ? <Home signedIn={eligible} /> : timeline ? <TimelinePage /> : !ready ? <main className="summary view" role="status">Loading your account…</main>
    : authPage ? <main className="summary view"><h1>Sign in or create an account</h1>
      <p>Use your University of Michigan Google account to save your preferences and see housing recommendations.</p>
      {session && !eligible && <p role="alert">Choose your @umich.edu Google account to continue.</p>}
      {path === '/auth/callback' && !session && <p role="status">Sign-in didn’t finish. Try again to continue.</p>}
      <button className="btn-primary auth-action" disabled={busy || !supabase} onClick={signIn}>{busy ? 'Please wait…' : 'Continue with Google'}</button>
      {!supabase && <p role="status">Sign-in is unavailable until this site’s Supabase connection is configured.</p>}
    </main> : eligible && user ? path.startsWith('/preferences/') ? <Journey key={user.id} accountId={user.id}/> : <Dashboard key={user.id} user={user}/> : null}
    </Suspense>
  </>
}
