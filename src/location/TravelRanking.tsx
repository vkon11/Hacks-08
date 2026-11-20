import { useState, type RefObject } from 'react'
import { ArrowDown, ArrowUp, Bike, BusFront, CarFront, Footprints, RotateCcw, Undo2 } from 'lucide-react'
import { isCompleteRanking, TRAVEL_LABELS, TRAVEL_MODES, undoMode } from '../model/inputs'
import type { TravelMode } from '../model/types'

const icons = { walk: Footprints, car: CarFront, bus: BusFront, bike: Bike }

interface Props {
  ranking: TravelMode[]
  onRanking: (ranking: TravelMode[]) => void
  fieldRef: RefObject<HTMLFieldSetElement | null>
  invalid: boolean
}

export default function TravelRanking({ ranking, onRanking, fieldRef, invalid }: Props) {
  const complete = isCompleteRanking(ranking)
  const [selected, setSelected] = useState<TravelMode | null>(null)
  const [justCompleted, setJustCompleted] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const active = selected && ranking.includes(selected) ? selected : ranking[0]
  const selectedIndex = ranking.indexOf(active)

  function announceOrder(modes: TravelMode[]) {
    setAnnouncement(modes.map((mode, i) => (i + 1) + ' ' + TRAVEL_LABELS[mode]).join(', '))
  }

  function pick(mode: TravelMode, keyboard: boolean) {
    if (complete) {
      setSelected(mode)
      return
    }
    const next = [mode, ...TRAVEL_MODES.filter(candidate => candidate !== mode)]
    setJustCompleted(true)
    setSelected(mode)
    announceOrder(next)
    onRanking(next)
    if (keyboard) requestAnimationFrame(() => fieldRef.current?.querySelector<HTMLButtonElement>('.travel-mode')?.focus())
  }

  function move(direction: number) {
    const next = [...ranking]
    const to = selectedIndex + direction
    if (to < 0 || to >= next.length) return
    next.splice(selectedIndex, 1)
    next.splice(to, 0, active)
    setJustCompleted(false)
    setSelected(active)
    announceOrder(next)
    onRanking(next)
  }

  function undo() {
    const next = undoMode(ranking)
    setJustCompleted(false)
    if (next.length) announceOrder(next)
    else setAnnouncement('All ranks cleared.')
    onRanking(next)
    if (!next.length) requestAnimationFrame(() => fieldRef.current?.querySelector('button')?.focus())
  }

  return <fieldset ref={fieldRef} className="location-ranking" aria-describedby={invalid ? 'ranking-help ranking-error' : 'ranking-help'}>
    <legend>How do you usually get around?</legend>
    <p id="ranking-help">{complete ? 'Your first mode drives commute estimates. Select one and move it to fine-tune the order.' : 'Choose the way you would use most. We’ll add the remaining modes as fallbacks.'}</p>
    {invalid && <p id="ranking-error" role="alert" className="location-error">Rank how you get around</p>}
    <ol className="travel-modes">
      {(complete ? ranking : TRAVEL_MODES).map(mode => {
        const index = ranking.indexOf(mode)
        const Icon = icons[mode]
        return <li key={mode}>
          <button type="button" disabled={!complete && index !== -1} aria-pressed={complete ? mode === active : undefined}
            className="travel-mode" onClick={event => pick(mode, event.detail === 0)}>
            {index !== -1 && <span className="travel-rank">{index + 1}</span>}
            <Icon size={20} aria-hidden="true" />
            {TRAVEL_LABELS[mode]}
          </button>
        </li>
      })}
    </ol>
    <div className="travel-actions">
      {complete && <>
        <button type="button" disabled={selectedIndex === 0} onClick={() => move(-1)}><ArrowUp />Move up</button>
        <button type="button" disabled={selectedIndex === ranking.length - 1} onClick={() => move(1)}><ArrowDown />Move down</button>
        <button type="button" onClick={() => {
          setSelected(null)
          setJustCompleted(false)
          setAnnouncement('All ranks cleared.')
          onRanking([])
          requestAnimationFrame(() => fieldRef.current?.querySelector('button')?.focus())
        }}><RotateCcw />Rank again</button>
      </>}
      {ranking.length > 0 && (!complete || justCompleted) && <button type="button" onClick={undo}><Undo2 />Undo last pick</button>}
    </div>
    <p className="location-sr" aria-live="polite" aria-atomic="true">{announcement}</p>
  </fieldset>
}
