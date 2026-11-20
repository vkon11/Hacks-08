import {
  draftSchema,
  freshRecord,
  pendingIdeas,
  firstIncomplete,
  MATCH_RESULT_VERSION,
  setupFromDraft,
  type HousingRecord,
  type Profile
} from './profile'
import { setupSchema } from '../ideal/contracts'

import { storageKey } from './storageKeys'
export { storageKey, clearLegacyProfiles } from './storageKeys'
import { matchResultSchema } from '../ideal/matchResult'

function readProfile(raw: Profile | null): Profile | null {
  if (
    !raw ||
    raw.schemaVersion !== 2 ||
    typeof raw.revision !== 'string' ||
    !Number.isFinite(Date.parse(raw.updatedAt))
  )
    return null
  const parsed = draftSchema.safeParse(raw.brief)
  const setup = setupSchema.safeParse(raw.setup)
  if (
    !parsed.success ||
    !setup.success ||
    !parsed.data.accepted ||
    pendingIdeas(parsed.data) ||
    firstIncomplete(parsed.data) !== 'builder'
  )
    return null
  const rebuilt = setupFromDraft(parsed.data)
  if (JSON.stringify(setup.data) !== JSON.stringify(rebuilt)) return null
  const clearedLegacyChoices = Object.keys(rebuilt.choices).length !== Object.keys(raw.setup.choices).length
  const result = matchResultSchema.safeParse(
    clearedLegacyChoices || raw.rankingVersion !== MATCH_RESULT_VERSION ? null : raw.result
  )
  return { ...raw, brief: parsed.data, setup: rebuilt, result: result.success ? result.data : null }
}
export function loadRecord(
  accountId: string,
  storage: Pick<Storage, 'getItem'> = localStorage
): HousingRecord {
  const json = storage.getItem(storageKey(accountId))
  if (!json) return freshRecord()
  try {
    const value = JSON.parse(json)
    if (value?.version !== 2) return freshRecord()
    const completed = readProfile(value.completed)
    const draft = draftSchema.safeParse(value.draft)
    return {
      version: 2,
      completed,
      draft: draft.success ? draft.data : (completed?.brief ?? freshRecord().draft)
    }
  } catch {
    return freshRecord()
  }
}
export function saveRecord(
  record: HousingRecord,
  accountId: string,
  storage: Pick<Storage, 'setItem'> = localStorage
) {
  storage.setItem(storageKey(accountId), JSON.stringify(record))
}
