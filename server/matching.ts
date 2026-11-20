import { POOL_SIZE, relevanceFor, softWeight, type HolisticAssessment, type HolisticAssessor, type RankingCard } from './shortlist.ts'
import { FINALISTS, type Message, requirementLabels, choiceLabel, roommateCountLabel, type Criterion, type RequirementId, type SearchSetup } from '../src/ideal/contracts.ts'
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
  provisionalReasons?: string[]
  priceEstimated?: boolean
  buildingDescription?: string
  layoutDescription?: string
  beds?: number | null
  baths?: number | null
  apartmentSqFt?: number | null
  planUrl?: string
  buildingLat?: number | null
  buildingLng?: number | null
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
  needsConfirmationCount?: number
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
  priceEstimated: boolean
  provisionalReasons: string[]
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
interface Evaluation { status: Status; evidenceIds: string[]; estimated?: boolean }
function known<T>(fact: Fact<T> | undefined): T | null {
  return fact?.state === 'known' ? fact.value : null
}
function estimated<T>(fact?: Fact<T>) {
  return fact?.state === 'known' && fact.estimated === true
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
  return { ...assessment(fact?.state === 'known' ? check(fact.value) : null, ...fact?.evidenceIds ?? []), estimated: estimated(fact) }
}
function routeEvidenceId(candidate: Candidate) { return 'calculated-commute:' + candidate.building.id }

function assessCondition(candidate: Candidate, id: RequirementId, value: string, hard: boolean): Evaluation {
  const { building, layout, option, offer, route } = candidate
  switch (id) {
    case 'commute': {
      if (!route) return assessment(null)
      const passes = route.minutes <= Number(value)
      const evidenceIds = [routeEvidenceId(candidate)]
      if (hard || passes) return { ...assessment(passes, ...evidenceIds), estimated: estimated(building.entrance) || /^estimate/i.test(route.basis) }
      return route.minutes <= Number(value) * 1.25
        ? { status: 'partially_supported', evidenceIds }
        : assessment(false, ...evidenceIds)
    }
    case 'area': return fromFact(option.apartmentSqFt ?? layout.apartmentSqFt, actual => actual >= Number(value))
    case 'ac': return fromFact(option.ac, provided => provided)
    case 'heat': {
      if (value === 'installed') return fromFact(option.heating, provided => provided)
      const heat = known(option.heating), included = known(offer.heatIncluded)
      const passes = heat === false || included === false ? false : heat === true && included === true ? true : null
      const verifiedFailure = (heat === false && !estimated(option.heating)) || (included === false && !estimated(offer.heatIncluded))
      return { ...assessment(passes, ...option.heating?.evidenceIds ?? [], ...offer.heatIncluded?.evidenceIds ?? []),
        estimated: !verifiedFailure && (estimated(option.heating) || estimated(offer.heatIncluded)) }
    }
    case 'bedroom': return fromFact(option.bedroomOccupancy, occupancy => occupancy === 1)
    case 'bathroom': return fromFact(option.privateBathroom, isPrivate => isPrivate)
    case 'pets': {
      const policy = offer.pets ?? option.pets ?? building.pets
      if (policy?.state !== 'known') return assessment(null)
      const species = value === 'both' ? ['cat', 'dog'] as const : [value === 'cat' ? 'cat' : 'dog'] as const
      const details = species.map(pet => ({
        allowed: policy.value[pet], estimated: policy.value[pet === 'cat' ? 'catEstimated' : 'dogEstimated'] ?? policy.estimated
      }))
      const anyDenied = details.some(entry => entry.allowed === false)
      const passes = anyDenied ? false : details.every(entry => entry.allowed === true) ? true : null
      const uncertain = anyDenied ? !details.some(entry => entry.allowed === false && !entry.estimated) : details.some(entry => entry.estimated)
      return { ...assessment(passes, ...policy.evidenceIds), estimated: uncertain }
    }
    case 'parking': {
      const fact = offer.onsiteParking
      const result = fromFact(fact, parking => parking.obtainable)
      return { ...result, estimated: fact?.state === 'known' ? fact.value.availabilityEstimated ?? fact.estimated : false }
    }
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
  let priceEstimated = total !== null ? estimated(offer.monthlyTotalCents) : estimated(offer.monthlyBaseCents) || estimated(offer.mandatoryMonthlyFeesCents)
  const verifiedParts = (estimated(offer.monthlyBaseCents) ? 0 : base ?? 0) + (estimated(offer.mandatoryMonthlyFeesCents) ? 0 : fees ?? 0)
  let minimumCents = conflict ? null : !priceEstimated && monthlyCents !== null ? monthlyCents : verifiedParts
  const costEvidenceIds = [offer.monthlyTotalCents, offer.monthlyBaseCents, offer.mandatoryMonthlyFeesCents]
    .flatMap(fact => fact?.evidenceIds ?? [])
  if (parkingRequired) {
    const parking = known(offer.onsiteParking)
    costEvidenceIds.push(...offer.onsiteParking?.evidenceIds ?? [])
    priceEstimated ||= estimated(offer.onsiteParking)
    if (parking?.obtainable && (parking.includedInMonthlyTotal === true || parking.monthlyCents === 0)) {
      // The selected parking space adds no new charge.
    } else if (parking?.obtainable && parking.includedInMonthlyTotal === false && parking.monthlyCents !== null) {
      if (monthlyCents !== null) monthlyCents += parking.monthlyCents
      if (!estimated(offer.onsiteParking)) minimumCents = (minimumCents ?? 0) + parking.monthlyCents
    } else monthlyCents = null
  }
  return { monthlyCents, minimumCents, costEvidenceIds, priceEstimated }
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
  const householdSize = setup.householdSize
  const surviving: { candidate: Candidate; unresolved: string[]; entrance: { lat: number; lng: number } | null }[] = []
  for (const offer of inventory.offers) {
    if (offer.listedAvailabilityStatus === 'sold_out') continue
    const option = options.get(offer.optionId)!
    const sourceLayout = layouts.get(option.layoutId)!
    const layout = sourceLayout.groupId && sourceLayout.groupId !== sourceLayout.id
      ? { ...sourceLayout, id: sourceLayout.groupId } : sourceLayout
    const bedrooms = known(layout.beds)
    const differentSize = householdSize !== undefined && bedrooms !== null && Math.max(1, bedrooms) !== householdSize
    if (differentSize && !estimated(layout.beds)) continue
    if (householdSize !== undefined && offer.requiredOccupants !== undefined && offer.requiredOccupants !== householdSize) continue

    const building = buildings.get(layout.buildingId)!
    const amounts = cost(offer, setup.choices.parking?.required === true)
    if (amounts.minimumCents !== null && amounts.minimumCents > setup.maxMonthlyCents) continue

    const candidate: Candidate = {
      building, layout, option, offer, ...amounts,
      evidence: Object.fromEntries([building, layout, option, offer].flatMap(collectEvidence).map(id => [id, evidence.get(id)!])),
      route: null, confirmed: [], provisionalReasons: [],
    }
    const checks = required.map(({ id, value }) => ({ id, value, result: assessCondition(candidate, id, value, true) }))
    if (checks.some(check => check.result.status === 'contradicted' && !check.result.estimated)) continue
    const unresolved = candidate.monthlyCents === null ? ['Monthly per-person cost including required fees needs confirmation'] : []
    if (offer.scopeQualification) unresolved.push(offer.scopeQualification)
    if (householdSize === undefined && offer.requiredOccupants) candidate.provisionalReasons.push('This rate requires ' + offer.requiredOccupants + ' occupants')
    if (offer.listedAvailabilityStatus === 'waitlist_now') unresolved.push('The published offer is waitlisted')
    if (candidate.monthlyCents !== null) {
      if (candidate.monthlyCents > setup.maxMonthlyCents) unresolved.push('Estimated monthly cost exceeds your budget')
      else if (householdSize !== undefined && offer.estimatedOccupants !== undefined && householdSize !== offer.estimatedOccupants) {
        unresolved.push('Per-person price assumes a different household size')
      } else if (candidate.priceEstimated) {
        candidate.provisionalReasons.push(offer.priceAssumption ?? 'Estimated per-person total including mandatory monthly fees')
      } else candidate.confirmed.push({ reason: 'Verified monthly cost fits your budget', evidenceIds: candidate.costEvidenceIds })
    }
    if (householdSize !== undefined) {
      if (bedrooms === null || differentSize) unresolved.push('Bedroom count needs confirmation for your roommate preference')
      else if (estimated(layout.beds)) candidate.provisionalReasons.push('Estimated bedroom count for your household')
      else candidate.confirmed.push({
        reason: householdSize === 1
          ? (bedrooms === 0 ? 'Studio for living alone' : 'One bedroom for living alone')
          : bedrooms + ' bedrooms for you and ' + roommateCountLabel(householdSize - 1),
        evidenceIds: layout.beds?.evidenceIds ?? [],
      })
    }
    for (const { id, value, result } of checks) {
      const requirement = requirementLabels[id] + ' · ' + choiceLabel(id, value)
      if (result.status === 'supported' && result.estimated) candidate.provisionalReasons.push(requirement + ' is estimated')
      else if (result.status === 'supported') candidate.confirmed.push({ reason: requirement, evidenceIds: result.evidenceIds })
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
      if (result.status === 'contradicted' && !result.estimated) continue
      if (result.status !== 'supported') unresolved.push('Commute to your pin needs confirmation')
      else if (result.estimated) candidate.provisionalReasons.push('Estimated commute is within your ' + commute.value + '-minute limit')
      else candidate.confirmed.push({ reason: 'Commute meets your ' + commute.value + '-minute limit', evidenceIds: result.evidenceIds })
    }
    if (unresolved.length) filtered.needsConfirmation.push({ ...matchIdentity(candidate), reasons: unresolved })
    else filtered.candidates.push(candidate)
  }
  filtered.qualifiedLayouts = new Set(filtered.candidates.map(candidate => candidate.layout.id)).size
  return filtered
}

function scoringCriteria(filtered: FilteredInventory, criteria: Criterion[]) {
  const unique = new Map<string, Criterion>()
  for (const c of criteria) {
    if (c.condition && filtered.setup.choices[c.condition.id]?.required &&
        filtered.setup.choices[c.condition.id]?.value === c.condition.value) continue
    const key = c.condition ? c.condition.id + ':' + c.condition.value : c.label.trim().toLowerCase()
    const previous = unique.get(key)
    if (!previous || softWeight(c) > softWeight(previous)) unique.set(key, c)
  }
  return [...unique.values()]
}
function displayMinutes(minutes: number) { return Math.round(minutes * 10) / 10 }
const ratings = { supported: 1, partially_supported: .5, contradicted: -1, unknown: 0 }

function weightedFit(candidate: Candidate, criteria: Criterion[], review?: HolisticAssessment) {
  let contribution = 0, verifiedWeight = 0, totalWeight = 0, observed = false
  const reasons: string[] = [], unknowns: string[] = []
  const evidenceIds = new Set<string>()
  const factors = new Map(review?.factors.map(factor => [factor.criterionId, factor]))
  for (const criterion of criteria) {
    const weight = softWeight(criterion)
    totalWeight += weight
    const evaluation: Evaluation | undefined = criterion.condition
      ? assessCondition(candidate, criterion.condition.id, criterion.condition.value, false)
      : factors.get(criterion.id)
    if (!evaluation || evaluation.status === 'unknown') {
      unknowns.push(criterion.label)
      continue
    }
    observed = true
    const provisional = evaluation.estimated || evaluation.evidenceIds.some(id => candidate.evidence[id]?.label.startsWith('Estimated '))
    const confidence = provisional ? .5 : 1
    contribution += weight * ratings[evaluation.status] * confidence
    if (!provisional) verifiedWeight += weight
    for (const id of evaluation.evidenceIds) evidenceIds.add(id)
    const label = evaluation.status === 'supported' ? 'Fits' : evaluation.status === 'partially_supported' ? 'Partial fit' : 'Falls short'
    reasons.push(label + ' · ' + criterion.label + (provisional ? ' (estimated)' : ''))
  }
  return {
    score: totalWeight ? contribution / totalWeight : 0,
    coverage: totalWeight ? verifiedWeight / totalWeight : 0, observed,
    reasons, unknowns, evidenceIds,
  }
}

interface RankedRow { candidate: Candidate; score: number; coverage: number; relevance: number }
function breakTies(a: RankedRow, b: RankedRow, useTravel: boolean) {
  const ca = a.candidate, cb = b.candidate
  return Number(!!ca.provisionalReasons.length) - Number(!!cb.provisionalReasons.length) ||
    b.coverage - a.coverage ||
    (useTravel ? (ca.route?.minutes ?? Infinity) - (cb.route?.minutes ?? Infinity) : 0) ||
    ca.monthlyCents! - cb.monthlyCents! || ca.layout.id.localeCompare(cb.layout.id) ||
    ca.option.id.localeCompare(cb.option.id) || ca.offer.id.localeCompare(cb.offer.id)
}
function strongestPool(rows: RankedRow[], tie: (a: RankedRow, b: RankedRow) => number) {
  const weighted = (a: RankedRow, b: RankedRow) => b.score - a.score || b.relevance - a.relevance || tie(a, b)
  const textual = (a: RankedRow, b: RankedRow) => b.relevance - a.relevance || weighted(a, b)
  // A credible description and still-unknown preference weight can justify a closer look.
  const upside = (r: RankedRow) => r.score + 1 - r.coverage
  const promising = (a: RankedRow, b: RankedRow) => upside(b) - upside(a) || textual(a, b)
  const chosen = new Map<string, RankedRow>()
  for (const [compare, quota] of [[weighted, 8], [textual, 5], [promising, POOL_SIZE - 13]] as const) {
    let added = 0
    for (const row of [...rows].sort(compare)) {
      if (chosen.has(row.candidate.layout.id)) continue
      chosen.set(row.candidate.layout.id, row)
      if (++added === quota) break
    }
  }
  return [...chosen.values()]
}

function rankingCard(candidate: Candidate, criteria: Criterion[], relevance: (text: string) => number): RankingCard {
  const evidence = Object.values(candidate.evidence)
  // The model sees only this offer's most relevant evidence. Keep excerpt IDs for validation.
  const conditionFacts = new Set(criteria.flatMap(c => c.condition ? assessCondition(candidate, c.condition.id, c.condition.value, false).evidenceIds : []))
  const descriptionIds = new Set(evidence.filter(item => item.label === 'Building description' || item.label === 'Floor-plan description').map(item => item.id))
  const relevant = evidence.map(item => ({ item, score: relevance(item.label + ' ' + item.text) + (conditionFacts.has(item.id) ? 3 : 0) + (descriptionIds.has(item.id) ? 4 : 0) }))
    .sort((a,b) => b.score - a.score).slice(0,8).map(({item}) => item)
  return {
    ...matchIdentity(candidate),
    buildingDescription: candidate.building.description ?? '', layoutDescription: candidate.layout.description ?? '',
    evidence: relevant,
  }
}

function validReviews(raw: HolisticAssessment[], cards: RankingCard[], criteria: Criterion[]) {
  const allowedCriteria = new Set(criteria.filter(c => !c.condition).map(c => c.id))
  const allowed = new Map(cards.map(c => [c.offerId, new Set(c.evidence.map(e => e.id))]))
  const byOffer = new Map<string, HolisticAssessment>(), seen = new Set<string>()
  for (const review of raw) {
    const evidence = allowed.get(review.offerId)
    if (!evidence) continue
    if (seen.has(review.offerId)) { byOffer.delete(review.offerId); continue }
    seen.add(review.offerId)
    const validIds = (ids: string[]) => Array.isArray(ids) && ids.length > 0 && ids.every(id => evidence.has(id))
    if (review.fit !== null && (!Number.isFinite(review.fit) || review.fit < 0 || review.fit > 100 ||
        !validIds(review.evidenceIds) || !review.reason.trim())) continue
    const factors = review.factors.filter(f => allowedCriteria.has(f.criterionId) &&
      Object.hasOwn(ratings, f.status) && validIds(f.evidenceIds))
    byOffer.set(review.offerId, { ...review, factors })
  }
  return byOffer
}
const verifiedValue = <T,>(f?: Fact<T>) => estimated(f) ? null : known(f)

export async function rankMatches(filtered: FilteredInventory, inputCriteria: Criterion[], assess?: HolisticAssessor, messages: Message[] = []): Promise<MatchResult> {
  const { status, needsConfirmation, qualifiedLayouts, routingUnavailable } = filtered
  const criteria = scoringCriteria(filtered, inputCriteria)
  const relevance = relevanceFor(criteria)
  const useTravel = !criteria.length || (!filtered.setup.choices.commute?.required && !criteria.some(c => c.condition?.id === 'commute'))
  const tie = (a: RankedRow, b: RankedRow) => breakTies(a, b, useTravel)
  const rows = filtered.candidates.map(candidate => {
    const base = weightedFit(candidate, criteria)
    const descriptions = [candidate.building.description, candidate.layout.description, candidate.option.name].join(' ')
    // Search attached excerpts too, so older normalized feeds without descriptions are usable.
    const listingEvidence = [candidate.building, candidate.layout, candidate.option, candidate.offer]
      .flatMap(record => record.evidenceIds ?? []).map(id => candidate.evidence[id]?.text ?? '').join(' ')
    return {candidate, score: base.score, coverage: base.coverage, relevance: criteria.length ? relevance(descriptions + ' ' + listingEvidence) : 0}
  })
  const pool = strongestPool(rows, tie)
  let reviews = new Map<string, HolisticAssessment>()
  let qualitativeStatus: MatchResult['qualitativeStatus'] = 'not_needed'
  if (pool.length && criteria.length) {
    qualitativeStatus = 'unavailable'
    if (assess) {
      const activeSources = new Set(criteria.flatMap(c => c.sourceMessageIds))
      const wording = messages.filter(m => m.role === 'student' && activeSources.has(m.id))
      const cards = pool.map(row => rankingCard(row.candidate, criteria, relevance))
      try {
        reviews = validReviews(await assess(cards, criteria, wording), cards, criteria)
        if (reviews.size === cards.length) qualitativeStatus = 'complete'
      } catch { /* The evidence and local ranking remain usable during provider outages. */ }
    }
  }
  const hasModelScores = [...reviews.values()].some(review => review.fit !== null)
  // With no usable review, consider the whole eligible catalog for the local fallback.
  const finalPool = reviews.size ? pool : rows
  const ranked = finalPool.map(row => {
    const review = reviews.get(row.candidate.offer.id)
    const weighted = weightedFit(row.candidate, criteria, review)
    const holistic = review?.fit == null ? null : review.fit / 50 - 1
    // During a partial review a missing model score contributes zero on the same scale as its peers.
    const score = hasModelScores
      ? .6 * (holistic ?? 0) + (weighted.observed ? .4 * weighted.score : .4 * (holistic ?? 0))
      : weighted.score
    return { ...row, score, coverage: weighted.coverage, weighted, review }
  }).sort((a,b) => b.score - a.score || tie(a,b))

  const distinct = new Set<string>()
  const finalists = ranked.filter(row => {
    const id = row.candidate.layout.id
    if (distinct.has(id)) return false
    distinct.add(id)
    return true
  }).slice(0, FINALISTS)
  const matches: Match[] = finalists.map(({candidate, weighted, review, score}) => {
    const hasReview = review?.fit != null
    const evidenceIds = new Set([...candidate.costEvidenceIds, ...weighted.evidenceIds, ...(hasReview ? review.evidenceIds : []),
      ...candidate.confirmed.flatMap(item => item.evidenceIds)])
    if (candidate.route) evidenceIds.add(routeEvidenceId(candidate))
    const entrance = known(candidate.building.entrance)
    return {
      ...matchIdentity(candidate), buildingLat: entrance?.lat ?? null, buildingLng: entrance?.lng ?? null,
      monthlyCents: candidate.monthlyCents!, priceEstimated: candidate.priceEstimated,
      provisionalReasons: candidate.provisionalReasons,
      sourceUrl: candidate.offer.sourceUrl, planUrl: candidate.layout.planUrl, checkedAt: candidate.offer.checkedAt,
      buildingDescription: candidate.building.description, layoutDescription: candidate.layout.description,
      beds: verifiedValue(candidate.layout.beds), baths: verifiedValue(candidate.layout.baths),
      apartmentSqFt: verifiedValue(candidate.option.apartmentSqFt ?? candidate.layout.apartmentSqFt),
      routeBasis: candidate.route?.basis ?? null, commuteMinutes: candidate.route ? displayMinutes(candidate.route.minutes) : null,
      availableFrom: candidate.offer.availableFrom ?? null, availableUntil: candidate.offer.availableUntil ?? null,
      score: criteria.length ? score : null, coverage: criteria.length ? weighted.coverage : null,
      evidence: [...evidenceIds].flatMap(id => candidate.evidence[id] ? [candidate.evidence[id]] : []),
      reasons: [...new Set([...(hasReview ? [review.reason] : []), ...weighted.reasons, ...candidate.confirmed.map(c => c.reason)])],
      unknowns: [...new Set([...(hasReview && review.tradeoff ? [review.tradeoff] : []), ...weighted.unknowns])],
    }
  })
  return { status, matches, needsConfirmation, qualifiedLayouts, assessedLayouts: reviews.size, routingUnavailable, qualitativeStatus }
}
