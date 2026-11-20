import { lazy, Suspense, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Home from '../app/Home'
import { ArrowLeft, Check, LockKeyhole, ShieldCheck } from 'lucide-react'
const Journey = lazy(() => import('../app/App'))
const Dashboard = lazy(() => import('./Dashboard'))
const TimelinePage = lazy(() => import('../timeline/TimelinePage'))
import { supabase } from './client'

function GoogleMark() {
  return <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.7A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.4H3.1a10 10 0 0 0 0 9.3L6.5 14Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 3.1 7.4l3.4 2.7A5.9 5.9 0 0 1 12 6Z"/></svg>
}

function AuthPage({ sessionIneligible, callbackFailed, busy, configured, onSignIn }: { sessionIneligible: boolean; callbackFailed: boolean; busy: boolean; configured: boolean; onSignIn: () => void }) {
  return <main className="auth-page" id="main">
    <section className="auth-panel" aria-labelledby="auth-title">
      <a className="auth-back" href="/"><ArrowLeft size={16}/> Back to overview</a>
      <div className="auth-card">
        <div className="auth-kicker"><span><LockKeyhole size={14}/></span> Private housing workspace</div>
        <h1 id="auth-title">Sign in or create your account</h1>
        <p className="auth-lede">Use your University of Michigan Google account. If it’s your first visit, we’ll create your workspace automatically.</p>
        {sessionIneligible && <div className="auth-alert" role="alert">That Google account isn’t a U-M account. Choose an address ending in <strong>@umich.edu</strong>.</div>}
        {callbackFailed && <div className="auth-alert" role="status">Sign-in didn’t finish. Nothing was saved—try again when you’re ready.</div>}
        <button className="google-button" disabled={busy || !configured} onClick={onSignIn}><GoogleMark/><span>{busy ? 'Opening secure sign-in…' : 'Continue with U-M Google'}</span></button>
        {!configured && <p className="auth-alert" role="status">Sign-in is unavailable until this site’s Supabase connection is configured.</p>}
        <div className="auth-privacy"><ShieldCheck size={17}/><p><strong>Your search stays yours.</strong><span>We use your account to separate and save your housing brief. We don’t infer demographics or share preferences with properties.</span></p></div>
        <p className="auth-terms">By continuing, you agree to use this independent student project for housing research—not as a substitute for confirming a lease.</p>
      </div>
    </section>
    <aside className="auth-preview" aria-label="What your account unlocks">
      <div className="auth-preview-copy"><span className="auth-preview-kicker"><Check size={14}/> Built around your actual week</span><h2>One account. A decision you can defend.</h2><p>Save the reasoning behind your shortlist—not just another pile of listing tabs.</p></div>
      <div className="auth-demo-card">
        <header><div><span>Example result</span><h3>Two-bedroom near Central Campus</h3></div><strong>$1,340<small>/ person</small></strong></header>
        <div className="auth-fit"><span><Check/>Private bedroom</span><span><Check/>12 min to your pin</span><span><Check/>Laundry in unit</span></div>
        <div className="auth-confidence"><span><i/>Evidence coverage</span><strong>92%</strong></div>
        <footer><span>Source excerpts</span><span>Tradeoffs</span><span>Compare finalists</span></footer>
      </div>
      <ul className="auth-benefits"><li><strong>1,500+</strong><span>apartment floor plans</span></li><li><strong>12</strong><span>requirement categories</span></li><li><strong>1,900+</strong><span>room and lease offers</span></li></ul>
      <p className="auth-independent"><ShieldCheck size={15}/> Independent student project · U-M portal inclusion is not endorsement.</p>
    </aside>
  </main>
}

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
    if (home) document.title = 'Find your best-fit Ann Arbor apartment · Ann Arbor Housing Board'
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
      <nav className={home ? 'account-nav home-nav' : 'account-nav'}>{home && <><a href="#how-it-works">Method</a><a className="nav-research" href="#research"><span/>Research</a><a className="nav-cta" href={eligible ? '/dashboard' : '/login'}>{eligible ? 'My search' : 'Sign in'}</a></>}
        {eligible && !home && path !== '/dashboard' && <a href="/dashboard">Dashboard</a>}
        {session && <button className="text-button" disabled={busy} onClick={signOut}>Sign out</button>}
      </nav></div></header>
    {error && <p className="storage-error" role="alert">{error}</p>}
    <Suspense fallback={<p className="summary view" role="status">Loading…</p>}>
    {home ? <Home signedIn={eligible} /> : timeline ? <TimelinePage /> : !ready ? <main className="summary view" role="status">Loading your account…</main>
    : authPage ? <AuthPage sessionIneligible={!!session && !eligible} callbackFailed={path === '/auth/callback' && !session} busy={busy} configured={!!supabase} onSignIn={signIn}/>
    : eligible && user ? path.startsWith('/preferences/') ? <Journey key={user.id} accountId={user.id}/> : <Dashboard key={user.id} user={user}/> : null}
    </Suspense>
  </>
}
