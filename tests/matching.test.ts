import test from 'node:test'
import assert from 'node:assert/strict'
import { parseInventory } from '../server/inventory'
import { filterInventory, rankMatches } from '../server/matching'
import type { Criterion, SearchSetup } from '../src/ideal/contracts'

const sourceUrl = 'https://example.org/fictional-apartment'
const checkedAt = '2026-11-20'
const evidence = [{ id:'listing', label:'Fictional listing', text:'Test apartment specifications', sourceUrl, checkedAt }]
const known = <T,>(value:T) => ({ state:'known' as const, value, evidenceIds:['listing'] })
const setup:SearchSetup = {
  maxMonthlyCents: 100000, pin: {lat:42.28,lng:-83.74,source:'map',landmarkId:null,label:'My pin'},
  travelModes:['walk','bus','car','bike'], choices:{},
}
function sample(count = 1) {
  return {
    schemaVersion:1, inventoryVersion:'fictional-test',
    buildings: [{id:'building',name:'Fictional Park',address:'1 Test St',entrance:known({lat:42.27,lng:-83.75})}],
    layouts: Array.from({length:count},(_,i) => ({id:'layout'+i,buildingId:'building',name:'Layout '+i, apartmentSqFt:known(750)})),
    options: Array.from({length:count},(_,i) => ({id:'option'+i,layoutId:'layout'+i,name:'Room '+i,roomSqFt:known(180),bedroomOccupancy:known(1),ac:known('installed'),heating:known(true)})),
    offers: Array.from({length:count},(_,i) => ({id:'offer'+i,optionId:'option'+i,name:'Offer '+i,sourceUrl,checkedAt, monthlyTotalCents:known(90000+i*100)})),
    evidence,
  }
}
const noRoute = async () => null
test('inventory validates provenance and identity links', () => {
  const raw = sample()
  assert.equal(parseInventory(raw).offers.length,1)
  assert.throws(() => parseInventory({...raw, evidence: []}), /evidence/)
  assert.throws(() => parseInventory({...raw, offers:[{...raw.offers[0],optionId:'unlinked'}]}), /option/)
  assert.throws(() => parseInventory({...raw, offers:[...raw.offers,...raw.offers]}), /Duplicate/)
})
test('room area and unspecified AC type or heat inclusion do not establish requirements', async () => {
  const raw = sample()
  const inventory = parseInventory({...raw,layouts:[{id:'layout0',buildingId:'building',name:'Layout'}]})
  const filtered = await filterInventory(inventory,{...setup,choices:{
    area:{value:'500',required:true}, ac:{value:'central',required:true}, heat:{value:'included',required:true},
  }}, noRoute)
  assert.equal(filtered.qualifiedLayouts,0)
  assert.match(filtered.needsConfirmation[0].reasons.join(' '),/size.*Air conditioning.*Heating/i)
})
test('verified failures exclude offers even when another fact is unknown', async () => {
  const raw = sample()
  const inventory = parseInventory({...raw,offers:[{...raw.offers[0],monthlyBaseCents:known(105000),monthlyTotalCents:undefined}]})
  const filtered = await filterInventory(inventory,{...setup,choices:{ac:{value:'central',required:true}}},noRoute)
  assert.equal(filtered.qualifiedLayouts,0)
  assert.equal(filtered.needsConfirmation.length,0)
})
test('rank once per layout, deduplicate routing, and keep the winning offer and provenance attached', async () => {
  const raw = sample(8)
  const inventory = parseInventory({...raw, offers:[...raw.offers,{...raw.offers[0],id:'better',monthlyTotalCents:known(88000)}]})
  let routes = 0
  const filtered = await filterInventory(inventory,setup,async () => {
    routes += 1
    return {minutes:19.9,basis:'19.9 minutes walking',sourceUrl,checkedAt}
  })
  const result = await rankMatches(filtered,[])
  assert.equal(routes,1)
  assert.equal(result.qualifiedLayouts,8)
  assert.equal(result.matches.length,5)
  assert.equal(new Set(result.matches.map(m=>m.layoutId)).size,5)
  assert.deepEqual([result.matches[0].offerId,result.matches[0].optionId,result.matches[0].monthlyCents],['better','option0',88000])
  assert.ok(result.matches[0].evidence.some(e=>e.id==='listing'))
})
test('qualitative scores require valid evidence and preserve unknowns', async () => {
  const raw = sample(2)
  const criteria:Criterion[] = [{id:'fit',theme:'Social',label:'Room for friends',importance:'strong',evidenceNeeded:'Usable living room',sourceMessageIds:['m'],condition:null}]
  const filtered = await filterInventory(parseInventory({...raw,layouts:raw.layouts.map(l=>({...l,evidenceIds:['listing']}))}),setup,noRoute)
  const result = await rankMatches(filtered,criteria, async () => [
    {criterionId:'fit',offerId:'offer0',status:'supported',evidenceIds:['missing'],reason:'Unsupported claim'},
    {criterionId:'fit',offerId:'offer1',status:'partially_supported',evidenceIds:['listing'],reason:'Living room exists'},
  ])
  assert.equal(result.matches[0].offerId,'offer1')
  assert.equal(result.matches[0].score,.5)
  assert.equal(result.matches[1].score,0)
  assert.equal(result.matches[1].coverage,0)
  assert.notEqual(result.matches[1].reasons.includes('Unsupported claim'),true)
  assert.equal((await rankMatches(filtered,criteria)).qualitativeStatus,'unavailable')
})

test('a required parking charge can disqualify an otherwise affordable offer', async () => {
  const raw = sample()
  const inventory = parseInventory({...raw,offers:[{...raw.offers[0],onsiteParking:known({
    obtainable:true,monthlyCents:12000,includedInMonthlyTotal:false,
  })}]})
  const flexible = await filterInventory(inventory,{...setup,choices:{parking:{value:'onsite',required:false}}},noRoute)
  assert.equal(flexible.qualifiedLayouts,1)
  const required = await filterInventory(inventory,{...setup,choices:{parking:{value:'onsite',required:true}}},noRoute)
  assert.equal(required.qualifiedLayouts,0)
  assert.equal(required.needsConfirmation.length,0)
})

test('hard commute is exact and does not become a second ranking bonus when soft preferences exist', async () => {
  const raw = sample(3)
  const inventory = parseInventory({
    ...raw,
    buildings: [{...raw.buildings[0]}, { ...raw.buildings[0], id:'closer', entrance:known({lat:42.285,lng:-83.739})},
      { ...raw.buildings[0], id:'slower', entrance:known({lat:42.286,lng:-83.739})}],
    layouts: [raw.layouts[0],{...raw.layouts[1],buildingId:'closer'},{...raw.layouts[2],buildingId:'slower'}],
  })
  const set = {...setup,choices:{commute:{value:'20',required:true}}}
  const filtered = await filterInventory(inventory,set,async ({lat}) => ({
    minutes:lat===42.285?10:lat===42.286?20.001:20,basis:'Walk',sourceUrl,checkedAt,
  }))
  assert.equal(filtered.qualifiedLayouts,2)
  assert.equal((await rankMatches(filtered,[])).matches[0].offerId,'offer1')

  const criteria:Criterion[] = [{id:'size',theme:'Space',label:'500+ sq ft total',importance:'ordinary',evidenceNeeded:'Layout area',sourceMessageIds:['m'],condition:{id:'area',value:'500'}}]
  assert.equal((await rankMatches(filtered,criteria)).matches[0].offerId,'offer0')
})

test('a shortlist keeps qualified candidates outside the deeper assessment pool', async () => {
  const raw = sample(34)
  const qualities:Criterion[] = [{id:'fit',theme:'Social',label:'Room for friends',importance:'strong',evidenceNeeded:'Usable living room',sourceMessageIds:['m'],condition:null}]
  const filtered = await filterInventory(parseInventory(raw),setup,noRoute)
  const result = await rankMatches(filtered,qualities,async cards => cards.map(card => ({
    offerId:card.offerId,criterionId:'fit',status:'contradicted',evidenceIds:['listing'],reason:'A small living area',
  })))
  assert.equal(result.qualifiedLayouts,34)
  assert.equal(result.assessedLayouts,30)
  assert.equal(result.matches.length,5)
  assert.ok(result.matches.slice(0,4).every(match=>match.score===0 && match.coverage===0))
})

test('research targets unresolved evidence near the cutoff and successful new facts can change the shortlist', async () => {
  const raw = sample(7)
  const qualities:Criterion[] = [{id:'light',theme:'Comfort',label:'Lots of sunlight',importance:'strong',evidenceNeeded:'Window exposure',sourceMessageIds:['m'],condition:null}]
  const filtered = await filterInventory(parseInventory({
    ...raw, offers:raw.offers.map(offer=>({...offer,officialUrls:[sourceUrl]})),
  }),setup,noRoute)
  let passes = 0
  const result = await rankMatches(filtered,qualities,async cards => {
    passes += 1
    return cards.map(card => {
      const researched = card.evidence.some(item=>item.id==='official-window')
      return {
        offerId:card.offerId,criterionId:'light',
        status:researched ? 'supported' : card.offerId==='offer6' ? 'unknown' : 'partially_supported',
        evidenceIds:researched ? ['official-window'] : card.offerId==='offer6' ? [] : ['listing'],
        reason:researched ? 'Confirmed southern exposure' : 'Initial assessment',
      }
    })
  },async cards => {
    assert.deepEqual(cards.map(card=>card.offerId),['offer6'])
    return cards.map(card=>({...card,evidence:[...card.evidence,{id:'official-window',label:'Official floor plan',text:'Living room has south-facing windows',sourceUrl,checkedAt}]}))
  })
  assert.equal(passes,2)
  assert.equal(result.matches[0].offerId,'offer6')
  assert.ok(result.matches[0].evidence.some(item=>item.id==='official-window'))
})

test('the missing inventory state is separate from a loaded feed with no eligible offers', async () => {
  assert.equal((await rankMatches(await filterInventory(null,setup,noRoute),[])).status,'no_inventory')
  const filtered = await filterInventory(parseInventory(sample()),{...setup,maxMonthlyCents:50000}, noRoute)
  assert.deepEqual(await rankMatches(filtered,[]),{
    status:'ready', matches:[], needsConfirmation:[], qualifiedLayouts:0, assessedLayouts:0,
    qualitativeStatus:'not_needed', routingUnavailable:false,
  })
})

test('bus routes include time from the representative departure and never silently use a walking itinerary', async () => {
  const { createOtpLookup, representativeDeparture } = await import('../server/routes')
  const now = new Date('2026-03-06T23:00:00Z')
  assert.equal(representativeDeparture(now).iso,'2026-03-09T08:30:00-04:00')
  const request:typeof fetch = async (_input, init) => {
    const variables = JSON.parse(String(init?.body)).variables
    assert.deepEqual(variables.modes.transit.transit,[{mode:'BUS'}])
    assert.equal(variables.dateTime.earliestDeparture,'2026-03-09T08:30:00-04:00')
    return Response.json({data:{planConnection:{edges:[
      {node:{duration:600,end:'2026-03-09T08:40:00-04:00',legs:[{mode:'WALK'}]}},
      {node:{duration:600,end:'2026-03-09T08:53:00-04:00',legs:[{mode:'WALK'},{mode:'BUS'}]}},
    ]}}})
  }
  const lookup = createOtpLookup('https://example.org/otp',request,()=>now)!
  assert.equal((await lookup({lat:42.27,lng:-83.75},{...setup,travelModes:['bus','walk','car','bike']}))?.minutes,23)
})

test('the new on-disk inventory format supplies five verified layouts for the new essentials', async () => {
  const { loadInventory } = await import('../server/inventory')
  const inventory = await loadInventory('tests/fixtures/fictional-inventory.json')
  const filtered = await filterInventory(inventory,{
    ...setup,maxMonthlyCents:150000,choices:{
      area:{value:'750',required:true},ac:{value:'central',required:true},heat:{value:'included',required:true},
    },
  })
  const result = await rankMatches(filtered,[])
  assert.equal(result.qualifiedLayouts,7)
  assert.equal(result.matches.length,5)
  assert.equal(result.matches[0].layoutId,'fictional-layout-1')
  assert.equal(result.matches[0].monthlyCents,109000)
  assert.ok(result.matches[0].reasons.some(reason=>reason.includes('Heating')))
})
