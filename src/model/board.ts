import type { Lane, Placement, Value, WeightedFactor } from './types.ts'
import { acceptsValue } from './catalog.ts'

export const LANES: Lane[] = ['must', 'want', 'avoid', 'forbid']
export const LANE_LABELS: Record<Lane, string> = {
  must: 'Must have', want: 'Nice to have', avoid: 'Prefer to avoid', forbid: 'Dealbreaker',
}

export function isSoft(lane: Lane): boolean {
  return lane === 'want' || lane === 'avoid'
}

export function isPlacementList(value: unknown): value is Placement[] {
  if (!Array.isArray(value)) return false
  const seen = new Set<string>()
  for (const card of value) {
    if (!card || !acceptsValue(card.id, card.value) || seen.has(card.id)) return false
    if (!LANES.includes(card.lane) || typeof card.starred !== 'boolean' || (!isSoft(card.lane) && card.starred)) return false
    seen.add(card.id)
  }
  return true
}

export function insertionSlot(laneRowsWithoutSource: Placement[], starred: boolean, index?: number): number {
  const strongCount = laneRowsWithoutSource.filter(other => other.starred).length
  const low = starred ? 0 : strongCount
  const high = starred ? strongCount : laneRowsWithoutSource.length
  return Math.max(low, Math.min(index ?? high, high))
}

function insertCard(board: Placement[], card: Placement, index?: number): Placement[] {
  const others = board.filter(other => other.id !== card.id)
  const lane = others.filter(other => other.lane === card.lane)
  const slot = insertionSlot(lane, card.starred, index)
  lane.splice(slot, 0, card)
  return LANES.flatMap(id => id === card.lane ? lane : others.filter(other => other.lane === id))
}

/** index is an insertion slot in the destination lane with the source removed. */
export function placeCard(board: Placement[], id: string, value: Value, lane: Lane, index?: number): Placement[] {
  if (!acceptsValue(id, value) || !LANES.includes(lane)) return board
  const current = board.find(card => card.id === id)
  const starred = isSoft(lane) && (current?.starred ?? false)
  const card = { id, value, lane, starred }
  if (current?.lane === lane) {
    const oldIndex = board.filter(other => other.lane === lane).findIndex(other => other.id === id)
    if ((index === undefined || index === oldIndex) && current.value === value) return board
    return insertCard(board, card, index ?? oldIndex)
  }
  return insertCard(board, card, index)
}

export function toggleStar(board: Placement[], id: string): Placement[] {
  const card = board.find(other => other.id === id)
  return card && isSoft(card.lane) ? insertCard(board, { ...card, starred: !card.starred }) : board
}

export function removeCard(board: Placement[], id: string): Placement[] {
  return board.some(card => card.id === id) ? board.filter(card => card.id !== id) : board
}

export function reorderCard(board: Placement[], id: string, direction: -1 | 1): Placement[] {
  const current = board.find(card => card.id === id)
  if (!current) return board
  const lane = board.filter(card => card.lane === current.lane)
  const target = lane.indexOf(current) + direction
  if (lane[target]?.starred !== current.starred) return board
  return insertCard(board, current, target)
}

/** Canonical wire order. The weight calculation never uses ids, settings, or travel modes. */
export function weightedFactors(board: Placement[]): WeightedFactor[] {
  if (!isPlacementList(board)) throw new Error('Check the settings and placement of each factor.')
  const output: WeightedFactor[] = []
  for (const lane of LANES) {
    const soft = isSoft(lane)
    for (const starred of soft ? [true, false] : [false]) {
      const group = board.filter(card => card.lane === lane && card.starred === starred)
      group.forEach(({ id, value }, index) => {
        const multiplier = 1 - 0.25 * index / Math.max(1, group.length - 1)
        const weight = (lane === 'avoid' ? -1 : 1) * (starred ? 3 : 1) * multiplier
        output.push({
          id, value, lane, starred, rank: index + 1,
          rule: soft ? 'soft' : lane === 'must' ? 'require' : 'forbid',
          signedWeight: soft ? Number(weight.toFixed(6)) : null,
        })
      })
    }
  }
  return output
}
