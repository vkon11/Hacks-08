import { useRef, useState, type CSSProperties } from 'react'
import { ArrowRight } from 'lucide-react'
import { parseBudgetCents, sliderMax } from '../model'
import { MAX_HOUSEHOLD_SIZE, roommateCountLabel } from '../ideal/contracts'

const dollars = new Intl.NumberFormat('en-US')
const roommateCounts = Array.from({ length: MAX_HOUSEHOLD_SIZE }, (_, count) => count)

interface BudgetProps {
  value: string
  householdSize?: number
  onChange: (value: string) => void
  onHouseholdSizeChange: (value: number | undefined) => void
  onContinue: () => void
}

export default function Budget({ value, householdSize, onChange, onHouseholdSizeChange, onContinue }: BudgetProps) {
  const field = useRef<HTMLInputElement>(null)
  const [error, setError] = useState(false)
  const cents = parseBudgetCents(value)
  const amount = (cents ?? 0) / 100
  const [maximum, setMaximum] = useState(() => sliderMax(value))
  function change(text: string) {
    onChange(text)
    setError(false)
  }
  function validate() {
    const invalid = cents === null
    setError(invalid)
    return !invalid
  }

  return <form className="budget-form" onSubmit={event => {
    event.preventDefault()
    if (validate()) onContinue()
    else field.current?.focus()
  }}>
    <div className="budget-card">
      <label htmlFor="budget-input" className="field-label">Maximum monthly budget</label>
      <div className={'currency-field' + (error ? ' field-error' : '')}>
        <span aria-hidden="true">$</span>
        <input id="budget-input" ref={field} type="text" inputMode="numeric" autoComplete="off"
          value={value} onChange={event => {
            setMaximum(sliderMax(event.target.value))
            change(event.target.value)
          }} onBlur={validate}
          aria-invalid={error} aria-describedby={error ? 'budget-unit budget-error' : 'budget-unit'} />
      </div>
      <span className="unit" id="budget-unit">per person / month</span>
      <p className="error-text budget-error" id="budget-error" aria-live="polite">{error ? 'Enter a whole-dollar amount of $0 or more.' : ''}</p>
      <div className="budget-slider">
        <label htmlFor="budget-slider">Adjust your budget</label>
        <input id="budget-slider" type="range" min="0" max={maximum} step="1" value={amount}
          aria-valuetext={'$' + dollars.format(amount) + ' per person per month'}
          style={{ '--fill': amount / maximum * 100 + '%' } as CSSProperties}
          onChange={event => change(event.target.value)} />
        <div className="range-ends" aria-hidden="true"><span>$0</span><span>${dollars.format(maximum)}</span></div>
      </div>
      <div className="search-context-fields">
        <label htmlFor="roommate-count">
          <span>How many roommates do you want?</span>
          <select id="roommate-count" value={householdSize === undefined ? '' : householdSize - 1}
            aria-describedby="roommate-count-help"
            onChange={event => onHouseholdSizeChange(event.target.value === '' ? undefined : Number(event.target.value) + 1)}>
            <option value="">No preference</option>
            {roommateCounts.map(count => <option value={count} key={count}>{roommateCountLabel(count)}</option>)}
          </select>
          <small id="roommate-count-help">We’ll look for one bedroom per person, including you. Studios work if you’re living alone.</small>
        </label>
      </div>
    </div>
    <button className="btn-primary" type="submit">Continue <ArrowRight size={18} /></button>
  </form>
}
