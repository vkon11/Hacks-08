import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { firstIncomplete, loadRecord } from '../model'
import { guardRoute, routePath } from '../app/routing'
import { Bookmark, Check, Clock3, MapPin, ShieldCheck, Wallet } from 'lucide-react'


export default function Dashboard({ user }: { user: User }) {
  const [record] = useState(() => { try { return loadRecord(user.id) } catch { return null } })
  const profile = record?.completed
  const draft = record?.draft
  const resume = draft && (draft.started && !profile || draft.editing)
  const step = draft ? guardRoute(draft.step, firstIncomplete(draft), !!profile) : 'budget'
  const displayName = user.user_metadata.full_name || user.email?.split('@')[0] || 'Wolverine'
  const matches = profile?.result?.matches.length ?? 0
  return <main id="main" className="dashboard-workspace view">
    <header className="dashboard-hero"><div><span className="eyebrow">Your housing search</span><h1>Welcome back, {displayName.split(' ')[0]}.</h1><p>One place to tune your priorities, compare the evidence and keep your decision moving.</p></div><div className="dashboard-account"><ShieldCheck size={18}/><span>U-M account</span><strong>{user.email}</strong></div></header>
    {profile ? <section className="search-snapshot" aria-labelledby="search-title"><header><div><span className="snapshot-status"><Check size={14}/> Brief ready</span><h2 id="search-title">Your current search</h2></div><a className="btn-primary" href="/preferences/saved">Open decision studio</a></header><div className="snapshot-grid"><div><Wallet/><span>Monthly ceiling</span><strong>${(profile.setup.maxMonthlyCents / 100).toLocaleString()} / person</strong></div><div><MapPin/><span>Main destination</span><strong>{profile.setup.pin.label}</strong></div><div><Bookmark/><span>Shortlist</span><strong>{matches ? `${matches} best-fit layouts` : 'Ready to refresh'}</strong></div><div><Clock3/><span>Last updated</span><strong>{new Date(profile.updatedAt).toLocaleDateString()}</strong></div></div><footer><p>{Object.keys(profile.setup.choices).length} must-haves · {profile.brief.criteria.length} brief preferences</p><a className="text-button" href={routePath(resume ? step : 'budget')}>{resume ? 'Continue editing' : 'Edit search inputs'}</a></footer></section>
    : <section className="dashboard-start"><div className="start-visual" aria-hidden="true"><i/><MapPin/><i/></div><span className="eyebrow">About 2 minutes</span><h2>Build your evidence-backed shortlist</h2><p>Start with your budget and destination. Then choose your requirements and describe where you’d like to live.</p><a className="btn-primary" href={routePath(step)}>{resume ? 'Continue my search' : 'Build my shortlist'}</a></section>}
    <section className="dashboard-method"><div><h2>What this search does differently</h2><p>It ranks specific floor plans—not marketing pages—and keeps missing facts visible instead of treating them as “no.”</p></div><ul><li><Check/>Per-person pricing and recurring fees</li><li><Check/>Commute to your own destination</li><li><Check/>Evidence excerpts and checked dates</li><li><Check/>Tradeoff testing before you decide</li></ul></section>
    <p className="dashboard-disclosure">Independent student project · Properties are privately operated · U-M portal inclusion is not endorsement.</p>
  </main>
}
