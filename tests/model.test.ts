import test from 'node:test'
import assert from 'node:assert/strict'
import * as model from '../src/model/index.ts'
import type { GuestRecord, Placement, TravelMode } from '../src/model/types.ts'

const laundry: Placement = { id: 'laundry', value: 'in_unit', lane: 'want', starred: true }
const bathroom: Placement = { id: 'private_bathroom', value: true, lane: 'want', starred: true }
const floor: Placement = { id: 'floor_level', value: 'lower_level', lane: 'avoid', starred: false }
const pin = { lat: 42.275, lng: -83.739, source: 'map', landmarkId: null, label: 'Dropped pin in Ann Arbor' } as const
const modes: TravelMode[] = ['bus','walk','bike','car']

function answered(placements: Placement[] = []): GuestRecord {
  const record = model.freshRecord()
  Object.assign(record.draft, {
    started: true, step: 'board', budgetInput: '1423', budgetConfirmed: true,
    idealLocation: pin, locationConfirmed: true, rankedTravelModes: [...modes], placements,
  })
  return record
}

function memoryStore() {
  const contents = new Map<string,string>()
  return { setItem: (key: string, value: string) => {contents.set(key, value)}, getItem: (key: string) => contents.get(key) ?? null }
}

test('catalog values and suggestions preserve starter order and keep all 61 IDs discoverable', () => {
  assert.equal(model.CATALOG.length, 61)
  assert.equal(new Set(model.CATALOG.map(f => f.id)).size, 61)
  assert.deepEqual(model.suggestions('walk').map(f => f.id), [
    'commute_to_my_pin','private_bedroom','apartment_size','private_bathroom','laundry','furnished','air_conditioning','heat_included',
  ])
  assert.ok(model.suggestions('bike').some(f => f.id === 'indoor_bike_storage'))
  assert.equal(model.placementLabel({id:'commute_to_my_pin',value:15,lane:'want',starred:false},'bus'), 'Commute to my pin · Bus · 15 min max')
})

test('budgets require whole nonnegative dollars whose cents fit exactly', () => {
  for (const invalid of ['', '  ', '-1', '1.2', '1.00', 'Infinity', '1e3', '100000000000000000']) {
    assert.equal(model.parseBudgetCents(invalid), null)
  }
  assert.equal(model.parseBudgetCents('0'), 0)
  assert.equal(model.parseBudgetCents('1423'), 142300)
  assert.equal(model.sliderMax('0'), 4000)
  assert.equal(model.sliderMax('4201'), 4500)
  assert.equal(model.sliderMax('5000'), 5000)
  assert.equal(model.firstIncomplete(model.freshRecord().draft), 'budget')
})

test('travel entry assigns the fourth rank only after three picks and undo removes both', () => {
  const partial: TravelMode[] = ['bus','walk']
  assert.deepEqual(model.pickMode(partial, 'walk'), partial)
  const complete = model.pickMode(partial,'bike')
  assert.deepEqual(complete, modes)
  assert.deepEqual(model.undoMode(complete), partial)
  assert.deepEqual(model.undoMode(partial), ['bus'])
  assert.ok(model.isCompleteRanking(modes))
  for (const invalid of [[], partial, ['walk','walk','bike','car'], ['walk','taxi','bike','car']]) {
    assert.equal(model.isCompleteRanking(invalid), false)
  }
})

test('soft groups have independent signed weights, while hard conditions have equal vetoes', () => {
  const factors = model.weightedFactors([
    floor,
    {...floor, id:'bedroom_floor_surface', value:'carpet'},
    {id:'private_bedroom',value:true,lane:'must',starred:false},
    laundry, bathroom,
    ...['study_room_in_building','gym_in_building','pool'].map(id => ({id,value:true,lane:'want',starred:false} as const)),
    {id:'parking_space',value:'covered',lane:'forbid',starred:false},
  ])
  assert.deepEqual(factors.map(f => [f.id,f.rank,f.rule,f.signedWeight]), [
    ['private_bedroom',1,'require',null],['laundry',1,'soft',3],['private_bathroom',2,'soft',2.25],
    ['study_room_in_building',1,'soft',1],['gym_in_building',2,'soft',0.875],['pool',3,'soft',0.75],
    ['floor_level',1,'soft',-1],['bedroom_floor_surface',2,'soft',-0.75],['parking_space',1,'forbid',null],
  ])
  assert.equal(model.weightedFactors([{...floor,starred:true}])[0].signedWeight, -3)
})

test('moving, changing settings, and reordering never duplicate or implicitly star a card', () => {
  const board = [laundry,bathroom,floor]
  const reordered = model.reorderCard(board,bathroom.id,-1)
  assert.deepEqual(model.weightedFactors(reordered).slice(0,2).map(f => [f.id,f.signedWeight]), [['private_bathroom',3],['laundry',2.25]])
  const hard = model.placeCard(reordered,bathroom.id,true,'forbid')
  assert.deepEqual(hard.at(-1), {...bathroom,lane:'forbid',starred:false})
  assert.deepEqual(model.weightedFactors(hard).at(-1)?.signedWeight,null)
  const ordinary = model.placeCard(hard,bathroom.id,true,'want',0)
  assert.deepEqual(ordinary, [laundry,{...bathroom,starred:false},floor])
  assert.deepEqual(model.placeCard(ordinary,laundry.id,'in_building','want'), [{...laundry,value:'in_building'},ordinary[1],floor])
  assert.deepEqual(model.placeCard(ordinary,laundry.id,'in_unit','avoid'), [ordinary[1],{...laundry,lane:'avoid'},floor])
  assert.deepEqual(model.removeCard(model.toggleStar(ordinary,bathroom.id),floor.id), [laundry,bathroom])
  assert.deepEqual(board, [laundry,bathroom,floor])
})

test('invalid preset values never enter the board; typed numeric choices survive moving into avoids', () => {
  assert.deepEqual(model.placeCard([],'apartment_size','750','must'), [])
  const placed = model.placeCard([],'apartment_size',750,'must')
  assert.deepEqual(model.placeCard(placed,'apartment_size',750,'avoid'), [{id:'apartment_size',value:750,lane:'avoid',starred:false}])
})

test('finalization rejects duplicate factors, invalid settings, hard stars and incomplete inputs', () => {
  for (const placements of [[laundry,laundry], [{...laundry,value:'undefined'}], [{...laundry,lane:'must'}] as Placement[], [{...laundry,id:'garbage'}]]) {
    assert.throws(() => model.completeRecord(answered(placements)))
  }
  for (const patch of [
    {budgetConfirmed:false}, {locationConfirmed:false}, {rankedTravelModes:['bus','bus','walk','bike']},
    {rankedTravelModes:['bus']},{rankedTravelModes:['bus','pony','walk','bike']},
    {idealLocation:{...pin,lat:45}}, {idealLocation:{...pin,source:'landmark',landmarkId:'unknown'}},
  ]) {
    const record = answered()
    Object.assign(record.draft,patch)
    assert.throws(() => model.completeRecord(record))
  }
})

test('an empty profile can be saved, and editing or finishing twice keeps a stable profile ID', () => {
  const original = answered()
  const saved = model.completeRecord(original)
  const profile = saved.completed!
  assert.equal(original.completed, null)
  assert.deepEqual(profile.factors, [])
  assert.equal(profile.budget.maxMonthlyCents,142300)
  assert.deepEqual(profile.rankedTravelModes,modes)
  assert.equal(profile.schemaVersion,1)
  const previous = model.completeRecord(answered([laundry]))
  const edit = {...previous, draft:{...previous.draft, budgetInput:'1601',editing:'budget' as const}}
  const next = model.completeRecord(edit)
  assert.equal(previous.completed!.budget.maxMonthlyCents,142300)
  assert.equal(next.completed!.budget.maxMonthlyCents,160100)
  assert.equal(next.draft.editing,null)
  assert.equal(previous.completed!.profileId, next.completed!.profileId)
  assert.deepEqual(model.completeRecord(next).completed!.factors,previous.completed!.factors)
})

test('draft reload and snapshot are independent, and account namespaces cannot read guest preferences', () => {
  const storage = memoryStore()
  const record = model.completeRecord(answered([floor,laundry]))
  record.draft.rankedTravelModes = ['bike','bus']
  record.draft.locationConfirmed = false
  record.draft.step = 'location'
  record.draft.editing = 'location'
  model.saveRecord(record,undefined,storage)
  const restored = model.loadRecord(undefined,storage)
  assert.deepEqual(restored,record)
  assert.equal(model.firstIncomplete(restored.draft),'location')
  assert.deepEqual(model.loadRecord('another account',storage).completed,null)
  assert.throws(() => model.saveRecord(record,undefined,{setItem:() => { throw new Error('quota exceeded') }}))
  assert.throws(() => model.loadRecord(undefined,{getItem:() => { throw new Error('denied') }}))
})

test('larger strength groups round each exported weight to six decimal places', () => {
  const board = ['private_bedroom','private_bathroom','pool','dishwasher'].map(id => (
    { id, value: true, lane: 'avoid', starred: false } as const
  ))
  assert.deepEqual(model.weightedFactors(board).map(factor => factor.signedWeight), [-1,-0.916667,-0.833333,-0.75])
})

test('a corrupted draft can recover from its valid saved snapshot; forged factor weights cannot be loaded', () => {
  const saved = model.completeRecord(answered([laundry,bathroom]))
  const missingDraft = model.loadRecord(undefined, {
    getItem: () => JSON.stringify({...saved, draft: null}),
  })
  assert.deepEqual(missingDraft.completed,saved.completed)
  assert.deepEqual(missingDraft.draft.placements,[laundry,bathroom])
  const corrupted = structuredClone(saved)
  corrupted.completed!.factors[1].signedWeight = 3
  const restored = model.loadRecord(undefined, { getItem: () => JSON.stringify(corrupted) })
  assert.equal(restored.completed,null)
  assert.deepEqual(restored.draft.placements,[laundry,bathroom])
})
