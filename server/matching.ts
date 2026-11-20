import { FINALISTS, requirementLabels, choiceLabel, type Criterion, type RequirementId, type SearchSetup } from '../src/ideal/contracts.ts'
import type { Fact, Inventory, MatchEvidence } from './inventory.ts'
import type { RouteEstimate, RouteLookup } from './routes.ts'

type Building = Inventory['buildings'][number]
type Layout = Inventory['layouts'][number]
type Option = Inventory['options'][number]
type Offer = Inventory['offers'][number]
type Status = 'supported' | 'partially_supported' | 'contradicted' | 'unknown'

export interface EvidenceCandidate {
  optionId: string
  offerId: string
  layoutId: string
  buildingName: string
  layoutName: string
  optionName: string
  evidence: MatchEvidence[]
  officialUrls?: string[]
}
export interface QualitativeAssessment {
  offerId: string
  criterionId: string
  status: Status
  evidenceIds: string[]
  reason: string
}
export type QualitativeAssessor = (cards: EvidenceCandidate[], criteria: Criterion[]) => Promise<QualitativeAssessment[]>
export type EvidenceEnricher = (cards: EvidenceCandidate[], criteria: Criterion[]) => Promise<EvidenceCandidate[]>

export interface PendingMatch {
  layoutId: string
  optionId: string
  offerId: string
  buildingName: string
  address: string
  layoutName: string
  optionName: string
  reasons: string[]
}
export interface Match extends PendingMatch {
  monthlyCents: number
  commuteMinutes: number | null
  routeBasis: string | null
  sourceUrl: string
  checkedAt: string
  availableFrom: string | null
  availableUntil: string | null
  score: number | null
  coverage: number | null
  unknowns: string[]
  evidence: MatchEvidence[]
}
export interface MatchResult {
  status: 'no_inventory' | 'ready'
  matches: Match[]
  needsConfirmation: PendingMatch[]
  qualifiedLayouts: number
  assessedLayouts: number
  routingUnavailable: boolean
  qualitativeStatus: 'not_needed' | 'complete' | 'unavailable'
}
interface Candidate {
  building: Building
  layout: Layout
  option: Option
  offer: Offer
  evidence: Record<string, MatchEvidence>
  route: RouteEstimate | null
  monthlyCents: number | null
  minimumCents: number | null
  costEvidenceIds: string[]
  confirmed: { reason: string; evidenceIds: string[] }[]
}
export interface FilteredInventory {
  status: MatchResult['status']
  candidates: Candidate[]
  needsConfirmation: PendingMatch[]
  qualifiedLayouts: number
  routingUnavailable: boolean
  setup: SearchSetup
}
interface Evaluation { status: Status; evidenceIds: string[] }
interface Scored {
  candidate: Candidate
  score: number
  upper: number
  coverage: number
  relevant: MatchEvidence[]
  reasons: string[]
  unknowns: string[]
}

function known<T>(fact: Fact<T> | undefined): T | null {
  return fact?.state === 'known' ? fact.value : null
}
function collectEvidence(record: { evidenceIds?: string[] }): string[] {
  const fields = Object.values(record).flatMap(value => {
    if (!value || typeof value !== 'object' || !('evidenceIds' in value)) return []
    return (value as { evidenceIds: string[] }).evidenceIds
  })
  return [...record.evidenceIds ?? [], ...fields]
}
function assessment(passes: boolean | null, ...evidenceIds: string[]): Evaluation {
  return { status: passes === null ? 'unknown' : passes ? 'supported' : 'contradicted', evidenceIds }
}
function fromFact<T>(fact: Fact<T> | undefined, check: (value: T) => boolean | null): Evaluation {
  return assessment(fact?.state === 'known' ? check(fact.value) : null, ...fact?.evidenceIds ?? [])
}
function routeEvidenceId(candidate: Candidate) { return 'calculated-commute:' + candidate.building.id }

function assessCondition(candidate: Candidate, id: RequirementId, value: string, hard: boolean): Evaluation {
  const { building, layout, option, offer, route } = candidate
  switch (id) {
    case 'commute': {
      if (!route) return assessment(null)
      const passes = route.minutes <= Number(value)
      const evidenceIds = [routeEvidenceId(candidate)]
      if (hard || passes) return assessment(passes, ...evidenceIds)
      return route.minutes <= Number(value) * 1.25
        ? { status: 'partially_supported', evidenceIds }
        : assessment(false, ...evidenceIds)
    }
    case 'area': return fromFact(option.apartmentSqFt ?? layout.apartmentSqFt, actual => actual >= Number(value))
    case 'ac': return fromFact(option.ac, ac => {
      if (value === 'installed') return ac !== 'none'
      return ac === 'installed' ? null : ac === 'central'
    })
    case 'heat': {
      if (value === 'installed') return fromFact(option.heating, provided => provided)
      const heat = known(option.heating), included = known(offer.heatIncluded)
      const passes = heat === false || included === false ? false : heat === true && included === true ? true : null
      return assessment(passes, ...option.heating?.evidenceIds ?? [], ...offer.heatIncluded?.evidenceIds ?? [])
    }
    case 'bedroom': return fromFact(option.bedroomOccupancy, occupancy => occupancy === 1)
    case 'bathroom': return fromFact(option.privateBathroom, isPrivate => isPrivate)
    case 'pets': return fromFact(offer.pets ?? option.pets ?? building.pets, policy => {
      if (value === 'both') return policy.cat === false || policy.dog === false ? false
        : policy.cat === true && policy.dog === true ? true : null
      return value === 'cat' ? policy.cat : policy.dog
    })
    case 'parking': return fromFact(offer.onsiteParking, parking => parking.obtainable)
    case 'laundry': return fromFact(option.laundry, laundry => laundry === 'in_unit' || value === 'in_building' && laundry === 'in_building')
    case 'furnishing': return fromFact(option.furnishedBedroom, furnished => furnished)
    case 'stepFreeUnit': return fromFact(option.stepFreeUnit, stepFree => stepFree)
    case 'stepFreeLaundry': return fromFact(option.stepFreeLaundry, stepFree => stepFree)
  }
}

function cost(offer: Offer, parkingRequired: boolean) {
  const total = known(offer.monthlyTotalCents)
  const base = known(offer.monthlyBaseCents)
  const fees = known(offer.mandatoryMonthlyFeesCents)
  const parts = base !== null && fees !== null ? base + fees : null
  const conflict = offer.monthlyTotalCents?.state === 'conflicting' ||
    (total !== null && (parts !== null && total !== parts || (base ?? 0) > total || (fees ?? 0) > total))
  let monthlyCents = conflict ? null : total ?? parts
  let minimumCents = conflict ? null : monthlyCents ?? (base === null && fees === null ? null : (base ?? 0) + (fees ?? 0))
  const costEvidenceIds = [offer.monthlyTotalCents, offer.monthlyBaseCents, offer.mandatoryMonthlyFeesCents]
    .flatMap(fact => fact?.evidenceIds ?? [])
  if (parkingRequired) {
    const parking = known(offer.onsiteParking)
    costEvidenceIds.push(...offer.onsiteParking?.evidenceIds ?? [])
    if (parking?.obtainable && (parking.includedInMonthlyTotal === true || parking.monthlyCents === 0)) {
      // The selected parking space adds no new charge.
    } else if (parking?.obtainable && parking.includedInMonthlyTotal === false && parking.monthlyCents !== null) {
      if (monthlyCents !== null) monthlyCents += parking.monthlyCents
      minimumCents = (minimumCents ?? 0) + parking.monthlyCents
    } else monthlyCents = null
  }
  return { monthlyCents, minimumCents, costEvidenceIds }
}

function matchIdentity(candidate: Candidate) {
  const { building, layout, option, offer } = candidate
  return {
    layoutId: layout.id, optionId: option.id, offerId: offer.id,
    buildingName: building.name, address: building.address, layoutName: layout.name, optionName: option.name,
  }
}
function boundConcurrency<T>(items: T[], worker: (item: T) => Promise<void>) {
  let index = 0
  return Promise.all(Array.from({ length: Math.min(items.length, 8) }, async () => {
    while (index < items.length) await worker(items[index++])
  }))
}

export async function filterInventory(inventory: Inventory | null, setup: SearchSetup, lookup?: RouteLookup, signal?: AbortSignal): Promise<FilteredInventory> {
  const filtered: FilteredInventory = {
    status: inventory ? 'ready' : 'no_inventory', setup, candidates: [],
    needsConfirmation: [], qualifiedLayouts: 0, routingUnavailable: false,
  }
  if (!inventory) return filtered

  const buildings = new Map(inventory.buildings.map(item => [item.id, item]))
  const layouts = new Map(inventory.layouts.map(item => [item.id, item]))
  const options = new Map(inventory.options.map(item => [item.id, item]))
  const evidence = new Map(inventory.evidence.map(item => [item.id, item]))
  const required = Object.entries(setup.choices).flatMap(([id, choice]) =>
    choice.required && id !== 'commute' ? [{ id: id as RequirementId, value: choice.value }] : [],
  )
  const surviving: { candidate: Candidate; unresolved: string[]; entrance: { lat: number; lng: number } | null }[] = []
  for (const offer of inventory.offers) {
    const option = options.get(offer.optionId)!
    const layout = layouts.get(option.layoutId)!
    const building = buildings.get(layout.buildingId)!
    const amounts = cost(offer, setup.choices.parking?.required === true)
    if (amounts.minimumCents !== null && amounts.minimumCents > setup.maxMonthlyCents) continue

    const candidate: Candidate = {
      building, layout, option, offer, ...amounts,
      evidence: Object.fromEntries([building, layout, option, offer].flatMap(collectEvidence).map(id => [id, evidence.get(id)!])),
      route: null, confirmed: [],
    }
    const checks = required.map(({ id, value }) => ({ id, value, result: assessCondition(candidate, id, value, true) }))
    if (checks.some(check => check.result.status === 'contradicted')) continue
    const unresolved = candidate.monthlyCents === null ? ['Monthly per-person cost including required fees needs confirmation'] : []
    if (candidate.monthlyCents !== null) candidate.confirmed.push({
      reason: 'Verified monthly cost fits your budget', evidenceIds: candidate.costEvidenceIds,
    })
    for (const { id, value, result } of checks) {
      if (result.status === 'supported') candidate.confirmed.push({
        reason: requirementLabels[id] + ' · ' + choiceLabel(id, value), evidenceIds: result.evidenceIds,
      })
      else unresolved.push(requirementLabels[id] + ' · ' + choiceLabel(id, value) + ' needs confirmation')
    }
    surviving.push({ candidate, unresolved, entrance: known(building.entrance) })
  }

  const routeKey = (point: { lat: number; lng: number }) => point.lat + ',' + point.lng
  const points = new Map(surviving.flatMap(({ entrance }) => entrance ? [[routeKey(entrance), entrance] as const] : []))
  const routes = new Map<string, RouteEstimate>()
  if (lookup && points.size) {
    const deadline = AbortSignal.timeout(16_000)
    const routeSignal = signal ? AbortSignal.any([signal, deadline]) : deadline
    await boundConcurrency([...points], async ([key, entrance]) => {
      if (routeSignal.aborted) return
      try {
        const route = await lookup(entrance, setup, routeSignal)
        if (route && Number.isFinite(route.minutes) && route.minutes >= 0) routes.set(key, route)
      } catch {
        // A failed route stays unknown and cannot satisfy a hard commute requirement.
      }
    })
  }
  signal?.throwIfAborted()
  const commute = setup.choices.commute
  for (const { candidate, unresolved, entrance } of surviving) {
    candidate.route = entrance ? routes.get(routeKey(entrance)) ?? null : null
    if (!candidate.route) filtered.routingUnavailable = true
    if (candidate.route) {
      const id = routeEvidenceId(candidate)
      candidate.evidence[id] = {
        id, label: 'Calculated commute',
        text: displayMinutes(candidate.route.minutes) + ' min. ' + candidate.route.basis,
        sourceUrl: candidate.route.sourceUrl, checkedAt: candidate.route.checkedAt,
      }
    }
    if (commute?.required) {
      const result = assessCondition(candidate, 'commute', commute.value, true)
      if (result.status === 'contradicted') continue
      if (result.status === 'unknown') unresolved.push('Commute to your pin needs confirmation')
      else candidate.confirmed.push({ reason: 'Commute meets your ' + commute.value + '-minute limit', evidenceIds: result.evidenceIds })
    }
    if (unresolved.length) filtered.needsConfirmation.push({ ...matchIdentity(candidate), reasons: unresolved })
    else filtered.candidates.push(candidate)
  }
  filtered.qualifiedLayouts = new Set(filtered.candidates.map(candidate => candidate.layout.id)).size
  return filtered
}

function importance(criterion: Criterion) { return criterion.importance === 'strong' ? 3 : 1 }
const ratings: Record<Status, number> = { supported: 1, partially_supported: .5, contradicted: -1, unknown: 0 }
function scoringCriteria(filtered: FilteredInventory, criteria: Criterion[]) {
  const unique = new Map<string, Criterion>()
  const put = (criterion: Criterion) => {
    const key = criterion.condition ? criterion.condition.id + ':' + criterion.condition.value : criterion.label.trim().toLowerCase()
    const previous = unique.get(key)
    if (!previous || importance(criterion) > importance(previous)) unique.set(key, criterion)
  }
  for (const [rawId, choice] of Object.entries(filtered.setup.choices)) {
    if (choice.required) continue
    const id = rawId as RequirementId
    put({
      id: 'flex:' + id, theme: '', label: requirementLabels[id] + ' · ' + choiceLabel(id, choice.value),
      importance: 'ordinary', evidenceNeeded: '', sourceMessageIds: [], condition: { id, value: choice.value },
    })
  }
  for (const criterion of criteria) {
    if (criterion.condition && filtered.setup.choices[criterion.condition.id]?.required &&
        filtered.setup.choices[criterion.condition.id]?.value === criterion.condition.value) continue
    put(criterion)
  }
  return [...unique.values()]
}

function buildCard(candidate: Candidate): EvidenceCandidate {
  const { building, layout, option, offer } = candidate
  return {
    ...matchIdentity(candidate), evidence: Object.values(candidate.evidence),
    officialUrls: [...new Set([offer, option, layout, building].flatMap(record => record.officialUrls ?? []))],
  }
}

function compareStable(a: Candidate, b: Candidate) {
  return a.layout.id.localeCompare(b.layout.id) || a.option.id.localeCompare(b.option.id) || a.offer.id.localeCompare(b.offer.id)
}
function compareCost(a: Candidate, b: Candidate) { return a.monthlyCents! - b.monthlyCents! }
function compareTravel(a: Candidate, b: Candidate) {
  return (a.route?.minutes ?? Number.MAX_VALUE) - (b.route?.minutes ?? Number.MAX_VALUE)
}
function displayMinutes(minutes: number) { return Math.round(minutes * 10) / 10 }

function compareMatches(filtered: FilteredInventory, criteria: Criterion[]) {
  const canUseCommute = !criteria.length || (!filtered.setup.choices.commute?.required &&
    !criteria.some(criterion => criterion.condition?.id === 'commute'))
  return (a: Scored, b: Scored) => b.score - a.score ||
    (canUseCommute ? compareTravel(a.candidate, b.candidate) : 0) ||
    compareCost(a.candidate, b.candidate) || compareStable(a.candidate, b.candidate)
}

function score(candidate: Candidate, criteria: Criterion[], scores: Map<string, QualitativeAssessment>, research: EvidenceCandidate | undefined) {
  let total = 0, contribution = 0, knownWeight = 0
  const reasons = [...candidate.confirmed.map(item => item.reason)]
  const unknowns: string[] = []
  const evidence = new Map([...Object.values(candidate.evidence), ...research?.evidence ?? []].map(item => [item.id, item]))
  const references = new Set(candidate.confirmed.flatMap(check => check.evidenceIds))
  for (const criterion of criteria) {
    const weight = importance(criterion)
    total += weight
    const model = criterion.condition ? undefined : scores.get(JSON.stringify([candidate.offer.id, criterion.id]))
    const evaluation = criterion.condition
      ? assessCondition(candidate, criterion.condition.id, criterion.condition.value, false)
      : { status: model?.status ?? 'unknown', evidenceIds: model?.evidenceIds ?? [] }
    if (evaluation.status === 'unknown') {
      unknowns.push(criterion.label)
      for (const id of evaluation.evidenceIds) references.add(id)
      continue
    }
    knownWeight += weight
    contribution += weight * ratings[evaluation.status]
    for (const id of evaluation.evidenceIds) references.add(id)
    const phrase = evaluation.status === 'supported' ? 'Fits'
      : evaluation.status === 'contradicted' ? 'Falls short' : 'Partial fit'
    reasons.push(phrase + ' · ' + criterion.label + (model ? ' — ' + model.reason : ''))
  }
  if (candidate.route) references.add(routeEvidenceId(candidate))
  const relevant = [...references].flatMap(id => evidence.has(id) ? [evidence.get(id)!] : [])
  return {
    candidate, score: total ? contribution / total : 0, coverage: total ? knownWeight / total : 0,
    upper: total ? (contribution + total - knownWeight) / total : 0, relevant, reasons, unknowns,
  } satisfies Scored
}

function deepPool(scored: Scored[]) {
  const compare = (a: Scored, b: Scored) => compareStable(a.candidate, b.candidate)
  const compareKnown = (a: Scored, b: Scored) => b.score - a.score || b.coverage - a.coverage || compare(a, b)
  const comparePromising = (a: Scored, b: Scored) => b.upper - a.upper || a.coverage - b.coverage || compare(a, b)
  const compareTrip = (a: Scored, b: Scored) => compareTravel(a.candidate, b.candidate) || compareCost(a.candidate, b.candidate) || compare(a, b)
  const comparePrice = (a: Scored, b: Scored) => compareCost(a.candidate, b.candidate) || compareTravel(a.candidate, b.candidate) || compare(a, b)
  const selected = new Map<string, true>()
  for (const [order, size] of [[compareKnown, 12], [comparePromising, 8], [compareTrip, 5], [comparePrice, 5]] as const) {
    let chosen = 0
    for (const { candidate } of [...scored].sort(order)) {
      if (selected.has(candidate.layout.id)) continue
      selected.set(candidate.layout.id, true)
      if (++chosen === size) break
    }
  }
  return scored.filter(row => selected.has(row.candidate.layout.id)).sort(compareKnown)
}

function validAssessments(raw: QualitativeAssessment[], cards: EvidenceCandidate[], criteria: Criterion[]) {
  const allowedIds = new Set(criteria.map(criterion => criterion.id))
  const evidence = new Map(cards.map(card => [card.offerId, new Set(card.evidence.map(item => item.id))]))
  const scores = new Map<string, QualitativeAssessment>()
  const duplicates = new Set<string>()
  for (const entry of raw) {
    if (!entry || !Object.prototype.hasOwnProperty.call(ratings, entry.status) ||
        !allowedIds.has(entry.criterionId) || !evidence.has(entry.offerId) ||
        typeof entry.reason !== 'string' || !entry.reason.trim() || entry.reason.length > 600 || !Array.isArray(entry.evidenceIds)) continue
    const key = JSON.stringify([entry.offerId, entry.criterionId])
    if (duplicates.has(key) || scores.has(key)) {
      duplicates.add(key)
      scores.delete(key)
      continue
    }
    if (entry.status !== 'unknown' && !entry.evidenceIds.length) continue
    if (!entry.evidenceIds.every(id => evidence.get(entry.offerId)!.has(id))) continue
    scores.set(key, entry)
  }
  return scores
}

function researchScope(ranked: Scored[], cards: EvidenceCandidate[], criteria: Criterion[], ratings: Map<string, QualitativeAssessment>, totalWeight: number) {
  const byLayout = new Map<string, Scored>()
  for (const row of ranked) if (!byLayout.has(row.candidate.layout.id)) byLayout.set(row.candidate.layout.id, row)
  const winners = [...byLayout.values()]
  if (winners.length < 2 || !totalWeight) return { targets: [], missing: [] }
  const cutoff = winners[FINALISTS - 1]?.score
  const next = winners[FINALISTS]?.score
  const top = new Set(winners.slice(0, FINALISTS).map(row => row.candidate.layout.id))
  const byOffer = new Map(cards.map(card => [card.offerId, card]))
  const targets: EvidenceCandidate[] = []
  const missing = new Map<string, Criterion>()
  for (const row of ranked) {
    const card = byOffer.get(row.candidate.offer.id)
    if (!card?.officialUrls?.length) continue
    const unknown = criteria.filter(criterion => {
      const rating = ratings.get(JSON.stringify([card.offerId, criterion.id]))
      return !rating || rating.status === 'unknown'
    })
    const swing = unknown.reduce((amount, criterion) => amount + importance(criterion), 0) / totalWeight
    if (!swing) continue
    const minimum = row.score - swing
    const maximum = row.score + swing
    const consequential = cutoff !== undefined && next !== undefined
      ? top.has(row.candidate.layout.id) ? minimum <= next : maximum >= cutoff
      : winners.some(other => other.candidate.layout.id !== row.candidate.layout.id && other.score >= minimum && other.score <= maximum)
    if (!consequential) continue
    targets.push(card)
    for (const criterion of unknown) missing.set(criterion.id, criterion)
  }
  return { targets, missing: [...missing.values()] }
}

export async function rankMatches(filtered: FilteredInventory, inputCriteria: Criterion[], assess?: QualitativeAssessor, enrich?: EvidenceEnricher): Promise<MatchResult> {
  const { status, needsConfirmation, qualifiedLayouts, routingUnavailable } = filtered
  const criteria = scoringCriteria(filtered, inputCriteria)
  const qualitative = criteria.filter(criterion => !criterion.condition)
  const order = compareMatches(filtered, criteria)
  const baseline = filtered.candidates.map(candidate => score(candidate, criteria, new Map(), undefined))
  let ranked = baseline
  let assessedLayouts = 0
  let qualitativeStatus: MatchResult['qualitativeStatus'] = 'not_needed'
  if (baseline.length && qualitative.length) {
    qualitativeStatus = 'unavailable'
    if (assess) {
      const pool = qualifiedLayouts > 30 ? deepPool(baseline) : baseline
      const cards = pool.map(row => buildCard(row.candidate))
      const byOffer = new Map(cards.map(card => [card.offerId, card]))
      try {
        const assessmentInput = cards.filter(card => card.evidence.length > 0)
        const assessments = assessmentInput.length
          ? validAssessments(await assess(assessmentInput, qualitative), assessmentInput, qualitative)
          : new Map<string, QualitativeAssessment>()
        const rerank = () => baseline.map(row => byOffer.has(row.candidate.offer.id)
          ? score(row.candidate, criteria, assessments, byOffer.get(row.candidate.offer.id))
          : row)
        ranked = rerank()
        if (enrich) {
          const scope = researchScope([...ranked].sort(order), cards, qualitative, assessments,
            criteria.reduce((total, criterion) => total + importance(criterion), 0))
          if (scope.targets.length) {
            try {
              const enriched = await enrich(scope.targets, scope.missing)
              const changed = enriched.filter(card => {
                const original = byOffer.get(card.offerId)
                return original && card.evidence.some(item => !original.evidence.some(old => old.id === item.id))
              })
              if (changed.length) {
                const revised = validAssessments(await assess(changed, scope.missing), changed, scope.missing)
                for (const card of changed) byOffer.set(card.offerId, card)
                for (const [key, value] of revised) {
                  const previous = assessments.get(key)
                  if (!previous || previous.status === 'unknown') assessments.set(key, value)
                }
                ranked = rerank()
              }
            } catch { /* A research failure does not discard existing ratings. */ }
          }
        }
        if (assessments.size > 0) {
          const assessedOffers = new Set([...assessments.values()].map(item => item.offerId))
          assessedLayouts = new Set(cards.filter(card => assessedOffers.has(card.offerId)).map(card => card.layoutId)).size
          qualitativeStatus = 'complete'
        }
      } catch { /* Rank known facts when qualitative assessment is unavailable. */ }
    }
  }
  const ordered = [...ranked].sort(order)
  const matches: Match[] = []
  const usedLayouts = new Set<string>()
  for (const row of ordered) {
    const { candidate } = row
    if (usedLayouts.has(candidate.layout.id)) continue
    usedLayouts.add(candidate.layout.id)
    matches.push({
      ...matchIdentity(candidate), monthlyCents: candidate.monthlyCents!,
      routeBasis: candidate.route?.basis ?? null, commuteMinutes: candidate.route ? displayMinutes(candidate.route.minutes) : null,
      sourceUrl: candidate.offer.sourceUrl, checkedAt: candidate.offer.checkedAt,
      availableFrom: candidate.offer.availableFrom ?? null, availableUntil: candidate.offer.availableUntil ?? null,
      score: criteria.length ? row.score : null, coverage: criteria.length ? row.coverage : null,
      evidence: row.relevant, reasons: row.reasons, unknowns: row.unknowns,
    })
    if (matches.length === FINALISTS) break
  }
  return { status, matches, needsConfirmation, qualifiedLayouts, assessedLayouts, routingUnavailable, qualitativeStatus }
}
