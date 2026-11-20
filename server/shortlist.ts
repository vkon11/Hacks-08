import type { Criterion, Message } from '../src/ideal/contracts.ts'
import type { MatchEvidence } from './inventory.ts'

export const POOL_SIZE = 16
export const softWeight = (criterion: Criterion) => criterion.importance === 'strong' ? 3 : 1

export interface RankingCard {
  offerId: string
  layoutId: string
  buildingName: string
  layoutName: string
  optionName: string
  buildingDescription: string
  layoutDescription: string
  evidence: MatchEvidence[]
}

export interface FactorAssessment {
  criterionId: string
  status: 'supported' | 'partially_supported' | 'contradicted'
  evidenceIds: string[]
}
export interface HolisticAssessment {
  offerId: string
  fit: number | null
  reason: string
  tradeoff: string | null
  evidenceIds: string[]
  factors: FactorAssessment[]
}
export type HolisticAssessor = (cards: RankingCard[], criteria: Criterion[], messages: Message[]) => Promise<HolisticAssessment[]>

const stopWords = new Set(('the and for with from this that there their has have would like want need must really apartment apartments '
  + 'building floor plan place housing unit listing listed evidence show space room are into near more large big good').split(' '))
const synonyms = [
  ['pregame', 'pregames', 'hosting', 'entertain', 'entertaining', 'host'],
  ['gym', 'fitness', 'workout'], ['bright', 'sunny', 'daylight', 'sunlight', 'windows'],
  ['bike', 'bicycle', 'cycling'], ['climb', 'climbing', 'boulder', 'bouldering'],
  ['study', 'studying', 'workspace', 'desk'], ['balcony', 'patio', 'terrace'],
]
// Synonyms broaden retrieval. Only a cited fact or an explicit condition can establish a fit.
const canonical = new Map(synonyms.flatMap(group => group.map(word => [word, group[0]] as const)))
function terms(text: string) {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter(word => word.length > 2 && !stopWords.has(word))
    .map(word => canonical.get(word) ?? word.replace(/s$/, '')))
}

export function relevanceFor(criteria: Criterion[]) {
  const query = new Map<string, number>()
  for (const c of criteria) {
    for (const term of terms(c.label + ' ' + c.evidenceNeeded)) query.set(term, Math.max(query.get(term) ?? 0, softWeight(c)))
  }
  return (text: string) => {
    let score = 0
    for (const term of terms(text)) score += query.get(term) ?? 0
    return score
  }
}
