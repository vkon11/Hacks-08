import { Banknote, Bike, BusFront, CarFront, Check, Footprints, MapPin, Pencil, ShieldCheck, Star, type LucideIcon } from 'lucide-react'
import { LANES, LANE_LABELS, TRAVEL_LABELS, type PreferenceProfileV1, type Step, type TravelMode } from '../model'
import { FactorCard } from '../board/FactorCard'

const travelIcons: Record<TravelMode, LucideIcon> = { walk: Footprints, bike: Bike, car: CarFront, bus: BusFront }
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function Summary({ profile, onEdit, editInProgress }: { profile: PreferenceProfileV1; onEdit: (step: Step) => void; editInProgress: Step | null }) {
  const { idealLocation: pin } = profile
  function edit(step: Step, label: string) {
    return <button className="edit-link" onClick={() => onEdit(step)}><Pencil size={14} />{label}</button>
  }
  return <main className="summary view" id="main">
    <div className="saved-stamp"><Check size={16} strokeWidth={2.8} /> Saved on this device</div>
    <h1 tabIndex={-1}>Your priorities are saved</h1>
    {editInProgress && <button className="text-button resume-edit" onClick={() => onEdit(editInProgress)}>Resume unfinished edit</button>}
    <section className="summary-section"><div className="summary-heading"><h2><Banknote /> Budget</h2>{edit('budget', 'Edit budget')}</div>
      <p className="summary-budget">{money.format(profile.budget.maxMonthlyCents / 100)} <span>per person / month, maximum</span></p>
    </section>
    <section className="summary-section"><div className="summary-heading"><h2><MapPin /> Location &amp; travel</h2>{edit('location', 'Edit location & travel')}</div>
      <h3 className="summary-point">{pin.label}</h3><p className="summary-coords">{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</p>
      <ol className="travel-summary" aria-label="Travel modes, most used to least used">{profile.rankedTravelModes.map((mode, i) => {
        const Icon = travelIcons[mode]
        return <li key={mode}><span>{i + 1}</span><Icon size={17} />{TRAVEL_LABELS[mode]}</li>
      })}</ol>
    </section>
    <section className="summary-section"><div className="summary-heading"><h2><Star /> Apartment priorities</h2>{edit('board', 'Edit priorities')}</div>
      {profile.factors.length === 0 && <p>You saved your budget, location and travel order without extra priorities.</p>}
      <div className="summary-lanes">{LANES.map(lane => {
        const factors = profile.factors.filter(f => f.lane === lane)
        if (!factors.length) return null
        return <section key={lane} className={'summary-lane lane-' + lane}>
          <h3>{lane === 'forbid' && <ShieldCheck size={15} />}{LANE_LABELS[lane]}</h3>
          <ol>{factors.map(f => <li key={f.id}><FactorCard factorId={f.id} value={f.value} mode={profile.rankedTravelModes[0]} starred={f.starred} /></li>)}</ol>
        </section>
      })}</div>
    </section>
  </main>
}
