import { isPlacementList } from './board.ts'
import { isCompleteRanking, isTravelPrefix, parseBudgetCents } from './inputs.ts'
import { freshRecord, isObject, isCompletedProfile, draftFromProfile, validLocation } from './profile.ts'
import type { Draft, GuestRecord, Step } from './types.ts'

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'setItem'>

function storageKey(accountId?: string): string {
  return 'ann-arbor-housing-board:v1:' + (accountId ? 'account:' + accountId : 'guest')
}

function isStep(value: unknown): value is Step {
  return value === 'budget' || value === 'location' || value === 'board'
}

function restoreDraft(value: unknown, base: Draft): Draft {
  if (!isObject(value) || typeof value.profileId !== 'string' || !value.profileId) return base
  const budgetInput = typeof value.budgetInput === 'string' ? value.budgetInput : base.budgetInput
  const idealLocation = validLocation(value.idealLocation) ? value.idealLocation : null
  const rankedTravelModes = isTravelPrefix(value.rankedTravelModes) ? value.rankedTravelModes : []
  return {
    profileId: value.profileId,
    started: value.started === true, step: isStep(value.step) ? value.step : base.step,
    editing: isStep(value.editing) ? value.editing : null,
    budgetInput, budgetConfirmed: value.budgetConfirmed === true && parseBudgetCents(budgetInput) !== null,
    idealLocation, rankedTravelModes,
    locationConfirmed: value.locationConfirmed === true && idealLocation !== null && isCompleteRanking(rankedTravelModes),
    placements: isPlacementList(value.placements) ? value.placements : base.placements,
  }
}

/** Reading and writing can throw if the browser denies access. The UI retains its working copy. */
export function loadRecord(accountId?: string, storage: ReadableStorage = localStorage): GuestRecord {
  const json = storage.getItem(storageKey(accountId))
  if (!json) return freshRecord()
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return freshRecord()
  }
  if (!isObject(data) || data.version !== 1) return freshRecord()
  const completed = isCompletedProfile(data.completed) ? data.completed : null
  const base = completed ? draftFromProfile(completed) : freshRecord().draft
  const draft = restoreDraft(data.draft, base)
  if (completed && draft.profileId !== completed.profileId) return { version: 1, draft: base, completed }
  return { version: 1, draft, completed }
}

/** A single storage write commits draft and completed profile together. */
export function saveRecord(record: GuestRecord, accountId?: string, storage: WritableStorage = localStorage): void {
  storage.setItem(storageKey(accountId), JSON.stringify(record))
}
