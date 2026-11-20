import { useState } from 'react'
import {
  ArrowRight, Bath, BedDouble, CarFront, Check, ChevronDown, Fan, Flame, KeyRound, MapPin,
  PawPrint, Ruler, Sofa, WashingMachine, type LucideIcon,
} from 'lucide-react'
import { TRAVEL_LABELS } from '../model/inputs'
import { choiceLabel, requirementLabels, requirementValues, type RequirementChoices, type RequirementId, type TravelMode } from './contracts'
import './ui.css'

const cards: { id: RequirementId; icon: LucideIcon; description?: string }[] = [
  { id: 'commute', icon: MapPin },
  { id: 'area', icon: Ruler, description: 'Total space in the apartment.' },
  { id: 'ac', icon: Fan },
  { id: 'heat', icon: Flame },
  { id: 'bedroom', icon: BedDouble },
  { id: 'bathroom', icon: Bath },
  { id: 'pets', icon: PawPrint },
  { id: 'parking', icon: CarFront },
  { id: 'laundry', icon: WashingMachine },
  { id: 'furnishing', icon: Sofa },
]

const accessCards: typeof cards = [
  { id: 'stepFreeUnit', icon: KeyRound },
  { id: 'stepFreeLaundry', icon: WashingMachine },
]

const optionLabels: Partial<Record<RequirementId, Record<string, string>>> = {
  ac: { installed: 'Yes' },
  heat: { installed: 'Heating provided', included: 'Provided and included in rent' },
  bedroom: { private: 'My own bedroom' },
  bathroom: { private: 'My own bathroom' },
  laundry: { in_unit: 'In my apartment', in_building: 'In the building is fine' },
  furnishing: { furnished: 'Furnished bedroom' },
}

interface EssentialsProps {
  choices: RequirementChoices
  mode: TravelMode
  onChange: (choices: RequirementChoices) => void
  onContinue: () => void
}

export function Essentials({ choices, mode, onChange, onContinue }: EssentialsProps) {
  const [accessOpen, setAccessOpen] = useState(() => accessCards.some(({ id }) => choices[id]))
  const requiredCount = Object.keys(choices).length

  function select(id: RequirementId, value: string) {
    const next = { ...choices }
    if (next[id]?.value === value) delete next[id]
    else next[id] = { value, required: true }
    onChange(next)
  }

  function renderCard({ id, icon: Icon, description }: (typeof cards)[number]) {
    const choice = choices[id]
    const label = requirementLabels[id]
    const hint = id === 'commute'
      ? (mode === 'walk' ? 'Walking' : 'By ' + TRAVEL_LABELS[mode].toLowerCase()) + ' from home to your pin.'
      : description
    return <section className="essential-card" key={id} data-required={choice ? true : undefined} aria-labelledby={'essential-' + id}>
      <div className="essential-card-main">
        <div className="essential-label"><span className="essential-icon"><Icon size={18} aria-hidden="true" /></span>
          <h2 id={'essential-' + id}>{id === 'ac' ? 'Do you need air conditioning?' : label}</h2>
        </div>
        {hint && <p className="essential-hint">{hint}</p>}
        <div className="essential-values" role="group" aria-label={label + ' choices'}>
          {requirementValues[id].map(value => <button key={value} type="button" aria-pressed={choice?.value === value}
            onClick={() => select(id, value)}>
            {choice?.value === value && <Check size={14} aria-hidden="true" />}
            {optionLabels[id]?.[value] ?? choiceLabel(id, value)}
          </button>)}
          {id === 'ac' && <button type="button" aria-pressed={!choice}
            onClick={() => { if (choice) select(id, choice.value) }}>
            {!choice && <Check size={14} aria-hidden="true" />}No
          </button>}
        </div>
      </div>
    </section>
  }

  return <div className="essentials">
    <div className="essentials-grid">{cards.map(renderCard)}</div>
    <div className="essentials-section-heading"><span>Access needs</span><p>Check step-free access to your unit or laundry.</p></div>
    <details className="essentials-access" open={accessOpen} onToggle={event => setAccessOpen(event.currentTarget.open)}>
      <summary><span><KeyRound size={17} aria-hidden="true" /> Access features</span><ChevronDown size={17} aria-hidden="true" /></summary>
      <div className="essentials-grid">{accessCards.map(renderCard)}</div>
    </details>
    <div className="essentials-footer">
      <span aria-live="polite">{requiredCount === 0 ? 'No additional requirements' : requiredCount + (requiredCount === 1 ? ' requirement' : ' requirements')}</span>
      <button className="btn-primary" type="button" onClick={onContinue}>Continue <ArrowRight size={18} aria-hidden="true" /></button>
    </div>
  </div>
}
