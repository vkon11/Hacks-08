import { lazy, Suspense, useRef, useState } from 'react'
import { ChevronDown, MapPin, Search } from 'lucide-react'
import { inBounds, isCompleteRanking, MAP_BOUNDS } from '../model/inputs'
import type { IdealLocation, TravelMode } from '../model/types'
import { findLandmarks, type Landmark } from './landmarks'
import { searchAnnArbor } from './placeSearch'
import TravelRanking from './TravelRanking'
import './location.css'

const MapCanvas = lazy(() => import('./MapCanvas').catch(() => ({
  default: () => <p className="location-notice" role="status">Map unavailable. Choose a campus landmark or enter coordinates.</p>,
})))

interface Props {
  pin: IdealLocation | null
  ranking: TravelMode[]
  onPin: (pin: IdealLocation) => void
  onRanking: (ranking: TravelMode[]) => void
  onContinue: () => void
}

function customPin(lat: number, lng: number, source: 'map' | 'coordinates'): IdealLocation {
  return { lat, lng, source, label: 'Dropped pin in Ann Arbor', landmarkId: null }
}

export default function Location({ pin, ranking, onPin, onRanking, onContinue }: Props) {
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [recenter, setRecenter] = useState(0)
  const [latitude, setLatitude] = useState(pin?.lat.toString() ?? '')
  const [longitude, setLongitude] = useState(pin?.lng.toString() ?? '')
  const [coordinateError, setCoordinateError] = useState<'lat' | 'lng' | null>(null)
  const [missing, setMissing] = useState<'pin' | 'ranking' | null>(null)
  const search = useRef<HTMLInputElement>(null)
  const results = useRef<HTMLDivElement>(null)
  const latInput = useRef<HTMLInputElement>(null)
  const lngInput = useRef<HTMLInputElement>(null)
  const modes = useRef<HTMLFieldSetElement>(null)
  const mapGroup = useRef<HTMLDivElement>(null)
  const request = useRef(0)
  const [online, setOnline] = useState<Landmark[]>([])
  const [notice, setNotice] = useState('')
  const landmarks = [...findLandmarks(query), ...online]

  async function searchMore() {
    const id = ++request.current
    setNotice('Searching Ann Arbor…')
    try {
      const matches = await searchAnnArbor(query)
      if (id !== request.current) return
      setOnline(matches)
      setNotice(matches.length ? 'Online results from OpenStreetMap' : 'No more places found. Try an address or tap the map.')
    } catch (error) {
      if (id === request.current) setNotice(error instanceof Error && error.message.startsWith('Please wait') ? error.message : 'Online search is unavailable. Try the campus results or tap the map.')
    }
  }

  function resetOnline() {
    request.current++
    setOnline([])
    setNotice('')
  }

  function choose(point: IdealLocation) {
    resetOnline()
    setSearchOpen(false)
    setQuery('')
    setLatitude(String(point.lat))
    setLongitude(String(point.lng))
    setCoordinateError(null)
    if (missing === 'pin') setMissing(null)
    onPin(point)
  }

  function selectLandmark({ id, label, lat, lng }: Landmark) {
    choose({ lat, lng, landmarkId: id, label, source: 'landmark' })
    setRecenter(n => n + 1)
    search.current?.focus()
    setSearchOpen(false)
  }

  function applyCoordinates() {
    const lat = latitude.trim() === '' ? NaN : Number(latitude)
    const lng = longitude.trim() === '' ? NaN : Number(longitude)
    if (!inBounds(lat, lng)) {
      const badLatitude = !Number.isFinite(lat) || lat < MAP_BOUNDS.south || lat > MAP_BOUNDS.north
      setCoordinateError(badLatitude ? 'lat' : 'lng')
      const invalidField = badLatitude ? latInput : lngInput
      invalidField.current?.focus()
      return
    }
    choose(customPin(lat, lng, 'coordinates'))
    setRecenter(n => n + 1)
  }

  function advance() {
    if (!pin) {
      setMissing('pin')
      search.current?.focus()
    } else if (!isCompleteRanking(ranking)) {
      setMissing('ranking')
      modes.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    } else onContinue()
  }

  return <div className="location-step">
    <div className="location-panel">
      <div className="landmark-search" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false)
      }} onKeyDown={event => {
        if (event.key === 'Escape') {
          search.current?.focus()
          setSearchOpen(false)
        }
      }}>
        <label htmlFor="landmark-input">Find a campus building or place</label>
        <div className="landmark-input"><Search size={19} aria-hidden="true" />
          <input ref={search} id="landmark-input" autoComplete="off" placeholder="Search by name, abbreviation or address"
            value={query} aria-invalid={missing === 'pin'} aria-describedby={missing === 'pin' ? 'pin-error' : undefined}
            onClick={() => setSearchOpen(true)} onFocus={() => setSearchOpen(true)}
            onChange={event => { resetOnline(); setQuery(event.target.value); setSearchOpen(true) }}
            onKeyDown={event => {
              if (event.key === 'Enter' && query.trim()) {
                event.preventDefault()
                if (landmarks.length) selectLandmark(landmarks[0])
                else void searchMore()
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSearchOpen(true)
                requestAnimationFrame(() => results.current?.querySelector('button')?.focus())
              }
            }} />
        </div>
        {missing === 'pin' && <p className="location-error" role="alert" id="pin-error">Choose a location</p>}
        {searchOpen && <div className="landmark-results" ref={results} role="group" aria-label="Landmark results">
          {landmarks.length ? landmarks.map(landmark => <button type="button" key={landmark.id} onMouseDown={event => event.preventDefault()} onClick={() => selectLandmark(landmark)}>
            <MapPin size={16} aria-hidden="true" /><span>{landmark.label}</span><small>{landmark.campus}</small>
          </button>) : <>
            <p>No campus directory matches.</p>
            <button type="button" onClick={() => {
              setQuery('')
              setSearchOpen(false)
              const target = mapGroup.current?.querySelector<HTMLElement>('.location-map') ?? latInput.current?.closest('details')?.querySelector('summary')
              target?.focus()
            }}>Choose a point on the map</button>
          </>}
          {query.trim() && <button type="button" onClick={searchMore}>Search all of Ann Arbor for “{query.trim()}”</button>}
          {notice && <p role="status">{notice}</p>}
        </div>}
      </div>
      <div ref={mapGroup}><Suspense fallback={<div className="location-map-loading" role="status">Loading map…</div>}>
        <MapCanvas pin={pin} onPoint={(lat, lng) => choose(customPin(lat, lng, 'map'))} recenter={recenter} />
      </Suspense></div>
      <details className="coordinate-disclosure">
        <summary><ChevronDown size={16} aria-hidden="true" />Enter coordinates</summary>
        <form className="coordinate-form" onSubmit={event => { event.preventDefault(); applyCoordinates() }}>
          <label>Latitude<input type="text" inputMode="decimal" ref={latInput} value={latitude} placeholder="42.275"
            aria-invalid={coordinateError === 'lat'} aria-describedby={coordinateError === 'lat' ? 'coordinate-error' : undefined}
            onChange={event => { setLatitude(event.target.value); setCoordinateError(null) }} /></label>
          <label>Longitude<input type="text" ref={lngInput} value={longitude} placeholder="−83.739"
            aria-invalid={coordinateError === 'lng'} aria-describedby={coordinateError === 'lng' ? 'coordinate-error' : undefined}
            onChange={event => { setLongitude(event.target.value.replace('−', '-')); setCoordinateError(null) }} /></label>
          <button className="btn-secondary" type="submit">Use coordinates</button>
          {coordinateError && <p className="location-error" id="coordinate-error" role="alert">{coordinateError === 'lat'
            ? `Enter a latitude from ${MAP_BOUNDS.south} to ${MAP_BOUNDS.north}.`
            : `Enter a longitude from ${MAP_BOUNDS.west} to ${MAP_BOUNDS.east}.`}</p>}
        </form>
      </details>
      <section className="selected-location" aria-label="Selected location" aria-live="polite" aria-atomic="true">
        <span className={'selected-location-icon' + (pin ? ' is-set' : '')}><MapPin size={22} aria-hidden="true" /></span>
        <div><span>Selected location</span><strong>{pin?.label ?? 'No pin selected'}</strong></div>
        {pin && pin.source !== 'landmark' && <small>{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</small>}
      </section>
    </div>
    <TravelRanking fieldRef={modes} ranking={ranking} invalid={missing === 'ranking'}
      onRanking={next => { onRanking(next); if (missing === 'ranking') setMissing(null) }} />
    <div className="location-footer"><button className="btn-primary" type="button" onClick={advance}>Continue</button></div>
  </div>
}
