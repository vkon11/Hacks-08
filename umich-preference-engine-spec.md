# Ann Arbor apartment preference engine
## Build brief for Codex Astra · Milestone 1

Build a working student journey from a public homepage to a saved, ordered preference profile. A student can set a maximum monthly housing cost, choose one ideal-location pin in the Ann Arbor area, rank Walk, Car, Bus and Bike by frequency on the same map screen, and express housing priorities by choosing, moving and ordering factor cards. The deliverable is a usable application plus a versioned profile that a later floor-plan matcher can consume.

**Build the questionnaire as the first working slice.** Start with a real homepage button wired through all three steps to a saved profile. Implement the board and its weighting rules next, then finish the homepage using the actual card components. This gives the team something testable early and makes the homepage accurately depict the product.

**Ownership.** The questionnaire team owns the homepage, form, map and travel ranking, catalog, board interactions, weighting and local persistence. The partner owns Supabase identity, sessions, authorization policies and account UI. A fresh checkout must support the entire guest journey without Supabase credentials. The handoff to the next milestone is `PreferenceProfileV1`. Apartment ingestion, matching, a top ten, pairwise comparisons and a top three begin after this handoff. Keep their routes, data and promotional promises out of this release.

## 1. Homepage concept and visual direction

Use **Beli’s product-led homepage** as the main reference. Beli introduces a location-based preference product by showing the actual map and lists. Translate that idea into a small Ann Arbor location map and a close-up of the housing board. For the questionnaire, use the GOV.UK question-page pattern of one primary question, Back, and Continue. The U-M campus map is the reference for local names and geography. [Beli](https://beliapp.com/) · [Question pages](https://design-system.service.gov.uk/patterns/question-pages/) · [U-M campus map](https://campusinfo.umich.edu/campusmap)

| Homepage element | Build |
|---|---|
| Header | Use the existing brand if provided. Fallback wordmark **Ann Arbor Housing Board**, linked to home. Allow a single account slot if the partner’s component exists. Keep the public start action independent. |
| Hero copy | H1 **What matters in your next Ann Arbor apartment?** Supporting line **Set your budget, choose where you want to live and how you get around, then sort your housing priorities.** Primary action **Start questionnaire**. |
| Hero visual | A quiet local street-map crop, a single clearly labeled Ross pin, and a compact read-only example board in the foreground. Put **Private bedroom** under *Must have*, **Laundry · In unit** under *Nice to have*, and **Floor level · Lower level** under *Dealbreaker*. Caption **Example board**. Use the same typography, chips and card surfaces as the live board. Display the example as a figure with a short text alternative. |
| Composition | Desktop hero at roughly 45% copy / 55% product sample, max width about 1180 px. Mobile order is title, sentence, full-width CTA, sample. At 390 × 844 the CTA is visible before scrolling. Use a bundled, attributed map crop from a source permitting redistribution or a minimal original geographic diagram with verified landmark positions. Keep the interactive map code off the home route. |
| Returning student | Unfinished draft → **Continue questionnaire**, with the saved step below it. Completed profile → **View my priorities**. The summary offers editing. Keep the preview illustrative and separate from the real board. |

Use warm ivory (#F8F6EF), dark ink (#172D37), white cards, deep teal (#155D59) for primary actions and maize (#E9BC45) sparingly for the map pin and stars. Give hard exclusions a distinct outline, textual label and icon. Choose **Bricolage Grotesque** for headings and **DM Sans** for controls, falling back to system sans. Start around 56–68 px for the desktop hero, 36–42 px on mobile, 32–40 px for step headings and 16 px for primary body text. Use flat printed-map colors, modest corner radii and generous card spacing. Preserve visible focus, contrast and control labels across all colors. A catalog search field, profile navigation, testimonials, counters or listing galleries do not belong on the landing view.

## 2. Routes, navigation and resuming

| Route | Screen title or action | Completion |
|---|---|---|
| `/` | Public homepage | Start, continue a draft, or view the saved profile |
| `/preferences/budget` | **What’s your maximum monthly housing budget?** | Explicit **Continue** commits the amount |
| `/preferences/location` | **Where would you most like to live near?** | **Continue** confirms the pin and travel order together |
| `/preferences/board` | **What matters in your apartment?** | **Save my priorities** validates and persists the profile |
| `/preferences/saved` | **Your priorities are saved** | Read back the saved profile and edit a section |

Keep a compact progress indicator, e.g. **2 of 3 · Location & travel**, with labels Budget, Location & travel, and Priorities. On desktop align the contents around one comfortable column on question screens, expanding for the map and board. On mobile keep the main action above the safe area and reserve content space below the last control. Back, browser Back and refresh preserve committed answers. A user entering a later route directly lands on the earliest missing prerequisite. Reopening a completed summary reads the saved snapshot. Field edits are drafts until the next save.

The student supplies all questionnaire inputs directly in the three steps. The board reads the most-used mode from the map step. For example, a student who ranks Bus first and picks 15 minutes sees **Commute to my pin · Bus · 15 min max**. Reuse that answer everywhere the board needs a travel mode. Keep the questionnaire usable when the account slot is absent or authentication loads slowly.

## 3. Budget interaction

Ask for **one hard maximum in USD per person per month**. Helper copy reads **Include your share of rent and required recurring housing fees.** This milestone stores a ceiling. A student with a $1,400 ceiling should never be assumed to have a $1,400 target or a second, comfortable-price input.

- Make the amount the focus. Show a large synchronized currency input and a labeled range slider, with **per person / month** beside the number. On a fresh draft propose $1,500. Continue explicitly accepts that visible value. Record whether the step has actually been confirmed.
- Show $0–$4,000 as the initial slider range and permit whole-dollar steps. Typing an amount above $4,000 expands the endpoint to the next $500 boundary. Retain exact typed amounts such as $1,423. These values are product defaults and must be easy to change.
- Support tapping the track, dragging, arrow keys, and typing. Validate on blur or Continue and focus the field on an error. Allow an empty editing buffer while typing. Reject empty, negative, fractional and nonnumeric submissions with **Enter a whole-dollar amount of $0 or more.** Persist integer cents. Editing a price preserves the pin, travel ranking and all board choices.

## 4. Location and travel on one screen

Start with an Ann Arbor overview showing Central and North campuses. The map opens without a selected pin. Centering or panning the view alone never changes the answer. Under the question, write **Pick the spot you’d like to be close to, like Ross, the Diag, or North Campus.** A person who chooses a park or a street corner gets the same experience as someone who chooses a campus building.

- Tap or click a point to place one pin. Tap again or drag its marker to replace the point. Pan, zoom, zoom buttons, search text and a pending tile response must never move an already selected point. Provide **Use map center** as a keyboard-accessible way to choose an arbitrary point after panning.
- A labeled **Find a campus landmark** field searches a small bundled list. Include at least Ross School of Business, the Diag, Michigan Union, Central Campus Transit Center, Duderstadt Center and Pierpont Commons. Verify the coordinates and stable IDs against campus sources when implementing. Support aliases such as “the Dude.” Search/filter is local. Selecting a result sets the pin, recenters, and shows its canonical label. Typing alone selects nothing. Empty results offer **Choose a point on the map**. [Campus Information](https://campusinfo.umich.edu/campusmap)
- Below the map, show **Selected location** with the landmark name or **Dropped pin in Ann Arbor** and coordinates for a custom point. A marker dragged away from a landmark becomes a custom point and loses the old name. Persist latitude, longitude, source and display label. Returning to this step restores the point and the travel order independently.
- Prefer the team’s existing map setup. If starting fresh, use a maintained stable Leaflet release with a configurable tile URL and attribution. For a small development demo, standard OSM tiles can be used under their policy, with visible attribution and normal browser caching. Size the map explicitly, lazy-load it, and preserve attribution on small screens. [Leaflet guide](https://leafletjs.com/examples/quick-start/) · [Tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- On tile failure show **Map unavailable. Choose a campus landmark or enter coordinates.** Both are real alternatives usable by keyboard. Provide labeled latitude/longitude inputs inside a disclosure, validate finite values and apply the same supported bounds used by the map. Define one configurable demo rectangle (proposed latitude 42.18–42.38, longitude −83.88 to −83.60). Preserve an earlier pin through errors. The form never needs device-location permission or a geocoder to finish.

### Compact travel ranking beneath the map

Use a small fieldset directly below **Selected location** and above the single **Continue** button. Label it **How do you usually get around?** Helper text reads **Tap from most used to least used.** Display exactly four compact buttons, **Walk**, **Car**, **Bus**, **Bike**. Each shows its label and, once ranked, a visible number. On a narrow phone, allow two rows. Keep the map as the main element of the screen.

- Start with all four unranked. Each tap adds the next rank. After the student picks three, give the remaining mode fourth place automatically and display the full ordered list before continuing. Example: tapping **Bus**, **Walk**, **Bike** yields **1 Bus · 2 Walk · 3 Bike · 4 Car**. Modes used rarely or never can go last.
- Provide **Undo last pick** during entry. After the third pick, undo also clears the automatically assigned fourth mode. A completed list supports **Move up**, **Move down**, and **Rank again**. Native button and keyboard interactions cover the full task. Announce each assignment and the completed order to assistive technology.
- Use one **Continue** for the pin and ranking. It advances when there is a valid pin and a complete order. On an incomplete submission, focus the first missing input and show **Choose a location** or **Rank how you get around**. Save partial picks, so a refresh after two taps restores exactly those two ranks. Changing the pin leaves the ranking intact, and reordering modes leaves the pin intact. Both controls work when map tiles fail.

## 5. Factor board

A student should be able to place **Private bedroom** into **Must have** immediately, see the result, and save. A student with many more preferences should be able to find and arrange the entire catalog on the same screen. The board starts empty. The starter tray holds suggestions, all initially neutral.

**Desktop.** Above about 1100 px, put a 260–290 px factor tray on the left and a two-by-two grid of lanes on the right. In reading order place *Must have* and *Nice to have* across the top, *Prefer to avoid* and *Dealbreaker* below. Keep every lane available when empty. Use a single page scroll and collapse the tray to a drawer when the layout stops fitting. Above the board, say **Choose what matters. Put your highest priorities first in each group.** Keep the save action reachable without covering the last card.

**Mobile.** Start with a compact starter tray and a visible **Add a factor** button. Follow it with vertically stacked lanes showing counts and selected cards. Tapping a starter opens its placement sheet directly. A sheet supports choosing its setting and lane with one hand. Give every placed card a **Move** action and **Move up / Move down** controls. Preserve the scroll position when a sheet closes. A horizontal kanban scroller cannot be the only path to a lane.

| Visible lane | Short explanation | Stored meaning |
|---|---|---|
| Must have | I need this to be true. | Require this exact condition |
| Nice to have | I’d prefer this. | Positive soft weight. Star means strongly want. |
| Prefer to avoid | I’d prefer to go without this. | Negative soft weight. Star means strongly avoid. |
| Dealbreaker | I’d rule out a place with this. | Forbid this exact condition |
| Unplaced cards | I haven’t chosen this. | Neutral, implicit weight zero |

**Find factors.** Start with the eight catalog starters in their supplied order. A link beside the tray reads **Add a factor** and opens a searchable picker with topic filters, all 61 cards, and quick access to Parking, Pets and Accessibility. Already placed items say their lane and open the existing card. An empty search has **Clear search**. Use the map’s first-ranked mode to suggest up to two relevant extras, e.g. indoor bike storage for Bike, parking for Car, or one-seat ride for Bus. Walk can use the eight starters alone. Updating the travel order refreshes suggestions and commute labels. Keep every existing card’s lane, star, rank and chosen setting. Extras carry no weight until placed.

**Choose settings.** A one-tap card such as *Private bedroom* always represents a single affirmative condition. The destination lane conveys the preference. Asking “yes or no?” a second time would make *No* plus *Dealbreaker* ambiguous. Preset cards have one inline segmented choice or one short radio list. Show the selected setting on the collapsed card, e.g. **Laundry · In unit**. Never silently pick a consequential threshold. For a new preset card dropped in a lane, hold the intended slot while the student chooses a value, then commit. Cancel restores the prior state. Existing preset values survive reorder, moves and editing. A custom map pin does not create a second catalog card.

**Move, order and undo.**

1. Drag by the handle; tapping anywhere else opens settings or actions. Highlight the actual destination and insertion line, including an empty lane or the end of a long list. Auto-scroll near viewport edges. Escape, an outside drop or touch cancellation restores the original placement. Moving a card can never duplicate it.
2. The tap/keyboard sheet offers exactly the same destinations and presets. Choosing a lane appends at its group’s end unless a drop specified an insertion point. Use *Move up* and *Move down* for exact reordering. Disable the unavailable action at each boundary. Moving between lanes updates counts immediately.
3. In each soft lane, show starred cards first under **Strong preference** when applicable, followed by ordinary cards. Order is meaningful within each strength group. Show the star as a labeled toggle with pressed state. Starring or unstarring appends to the target strength group. Reordering alone never changes strength. If a drop crosses a strength boundary, place it at the nearest edge of its current strength group in the destination lane; the star is the explicit way to change strength. Soft-to-soft moves preserve the star. Moving through a hard or neutral state clears it. Cards entering a soft lane from a hard or neutral state start ordinary.
4. **Remove from board** returns the card to neutral and makes it available in the tray or picker. Provide one-step **Undo** for the last completed board mutation, restoring the prior preset, lane, star and position. A second mutation replaces the undo target. Canceling an edit has no effect. Preserve focus on the moved card or the initiating control and announce changes such as **Laundry moved to Must have, position 2 of 3**.
5. Allow saving an empty board deliberately. On a completely empty board the primary action opens a short confirmation, **Save without any extra priorities?** Actions **Save these preferences** and **Keep sorting**. There is no minimum number of cards. A board with only hard rules or only avoids is valid. [W3C guidance on alternatives to dragging](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)

## 6. Deterministic weights and handoff

Keep one ordered placement per stable factor ID. Settings describe the **condition**; category, rank and strength describe the **importance**. E.g. *Floor level = lower level* in *Dealbreaker* means the explicit condition is forbidden. Preserve relative display order in hard lanes for editing and review. Every hard rule has equal veto power.

For each soft strength group separately, let `r` be one-based position and `n` the size of that group. Use `base = 3` for starred and `base = 1` for ordinary. Use `direction = +1` in Nice to have and `−1` in Prefer to avoid. Calculate from the current complete order after every committed board change. Use full precision in the calculation and round to six decimals at the serialization boundary.

~~~text
rankMultiplier = 1 - 0.25 * (r - 1) / max(1, n - 1)
signedWeight   = direction * base * rankMultiplier
~~~

| Example group, in order | Result |
|---|---|
| Two starred wants in order · In-unit laundry, Private bathroom | +3.00, +2.25. Reverse them and the values exchange. |
| Three ordinary wants in order · Study room, Gym, Pool | +1.00, +0.875, +0.75 |
| Two ordinary avoids in order · Lower level, Carpet | −1.00, −0.75 |
| One strongly avoided condition | −3.00 |
| Private bedroom in Must have, or Lower level in Dealbreaker | `require` or `forbid`, `signedWeight: null` |
| Neutral or removed card | Implicit zero, omitted from active factors |

Adding a third card to a two-card group recalculates the existing middle position. Reorder only within the relevant group. Hard gates and unplaced factors never enter a soft denominator. The budget defines a hard cap. The map pin and ranked travel modes are profile inputs. Mode order supplies the default commute mode and never adds points to a board card. The public UI uses ordered rows and stars to communicate importance. The numerical weights are available in the persisted payload for the next engine and in unit tests.

**Completed payload example.** Use strings for stable IDs, integer cents, ISO timestamps, numeric coordinates and structured settings. The coordinates below illustrate a custom selection. Each catalog predicate has one stable feature ID; the preset value specifies its variant. A fixed binary card uses `true`. Use snapshot versioning so future changes to the formula can be identified.

~~~json
{
  "schemaVersion": 1,
  "weightPolicyVersion": "category-rank-v1",
  "catalogVersion": "umich-factors-v1",
  "profileId": "02e6e5f8-45c6-4246-b678-672ae9639e54",
  "status": "complete",
  "updatedAt": "2026-11-20T16:00:00.000Z",
  "budget": {"maxMonthlyCents": 140000, "currency": "USD", "basis": "per_person"},
  "idealLocation": {"lat": 42.275, "lng": -83.739, "source": "map", "landmarkId": null, "label": "Dropped pin in Ann Arbor"},
  "rankedTravelModes": ["bus", "walk", "bike", "car"],
  "factors": [
    {"id": "private_bedroom", "value": true, "lane": "must", "starred": false, "rank": 1, "rule": "require", "signedWeight": null},
    {"id": "laundry", "value": "in_unit", "lane": "want", "starred": true, "rank": 1, "rule": "soft", "signedWeight": 3},
    {"id": "private_bathroom", "value": true, "lane": "want", "starred": true, "rank": 2, "rule": "soft", "signedWeight": 2.25},
    {"id": "floor_level", "value": "lower_level", "lane": "avoid", "starred": false, "rank": 1, "rule": "soft", "signedWeight": -1}
  ]
}
~~~

Valid lane IDs are `must | want | avoid | forbid`. Rule is `require | soft | forbid`. Rank is unique and contiguous within `(lane, starred)`, one-based. Hard lanes have `starred = false`. Allowed pin sources are `landmark | map | coordinates`. Landmark source requires a valid landmark ID. `rankedTravelModes` is a required top-level array in most-to-least-used order. A completed profile contains `walk`, `car`, `bus`, and `bike` exactly once each. Reject duplicates, missing modes and unknown IDs on finalization. Drafts may have a shorter unique prefix. Derive the primary mode from index 0. The `factors` array exports in fixed lane order, starred first, then rank. Derived weights must be reproducible from those fields alone. Finishing twice with identical answers reuses the profile ID and produces identical factor output.

## 7. Saving, editing and the Supabase boundary

- Use the existing project stack and conventions. If the implementation repo is empty and the team has no chosen stack, the suggested baseline is Next.js App Router, React and TypeScript. Keep the catalog, pure weight function and payload types independent of the router and storage. Use a tested sortable library compatible with that stack for drag sensors, with the same reducer actions powering drag, touch menus and keyboard controls.
- Give persistence a small public interface such as `loadDraft`, `saveDraft`, `loadCompleted` and `complete`. The guest implementation keeps one versioned browser-local record including the current draft and latest completed snapshot. Autosave on committed board mutations and when the budget, selected pin or travel order changes, including partial rankings. Flush before navigating. Validate on load. Budget can be provisional and the pin and travel order can be incomplete or unconfirmed in draft state. Track the first incomplete step independently from the last viewed step.
- Save the final snapshot atomically after validation. Reopen the summary from that exact snapshot. Editing creates a working draft while the previous completed snapshot stays readable. Saving replaces the snapshot for the same profile ID. An interrupted edit can resume. A quota or storage-denied failure keeps the in-memory work, explains **Changes couldn’t be saved on this device**, and offers **Retry**. Only show the saved heading after persistence succeeds.
- The partner can supply optional read-only session/account context at the app boundary. Namespace anonymous and account drafts separately if identity is available; never expose another user’s local draft on account switch. Until both teams integrate, completed guest profiles are device/browser-local. Leave remote tables, credentials, login, authorization and guest-to-account transfer with the partner. A future adapter can persist the same completed payload without changing the board or its weights.
- The summary is the endpoint. Show **Your priorities are saved**, **Saved on this device**, the exact budget, the selected location, the four travel modes in their saved order, and one ordered list per populated lane with setting and star state. Show **Edit budget**, **Edit location & travel** and **Edit priorities**. For an empty board, say **You saved your budget, location and travel order without extra priorities.** A summary edit to budget or to location and travel returns to the summary after resaving, preserving other fields; editing priorities returns after **Save my priorities**. Resume an interrupted edit at its saved step.

## 8. Build order and acceptance

1. Wire homepage CTA, routes, storage interface and an end-to-end guest save. Check that the same profile loads after refresh with the network unavailable once the page code is already loaded.
2. Implement the budget and map step with a real geographic pin, landmark and coordinate fallbacks, and the four-mode frequency ranking. Check pointer, keyboard and a narrow viewport.
3. Import the catalog, implement pure mutations and weight calculation, then add the card picker, preset controls, drag and tap placement, reorder, star and undo. Keep one state model for all input methods.
4. Finish the homepage with the real board preview, add summary/edit flows, verify the matrix below and give the team the shipped route names, run command and profile type location. Scope the implementation to this milestone.

| Acceptance case | Expected result |
|---|---|
| Fresh guest, no Supabase environment variables | Home → budget → map and travel ranking → board → saved works. No login dependency. |
| Enter $1,423, go back and refresh | Exact $1,423 returns. Completed profile stores 142300 cents. An untouched fresh proposal is confirmed only by Continue. |
| Type Ross, choose it, then place a custom pin | There is one marker. The Ross ID clears on replacement. Back/refresh restores the custom coordinates. |
| Simulate blocked tiles; complete using a landmark and, separately, a custom coordinate | Both paths accept the travel ranking and reach the board with the correct saved point. Invalid/out-of-area coordinates show an actionable message. |
| Pick Bus and Walk, refresh, then pick Bike | The first two ranks persist. Car fills fourth. Continue commits `["bus","walk","bike","car"]` only after a valid pin has been chosen. |
| Try to continue with only a pin or only a full travel order | Stay on step 2 and focus the missing input. There is no additional travel screen. |
| Edit a saved ranking so Bike replaces Bus at the top | The pin and every board placement, setting and weight persist. The commute card shows Bike, the summary shows the revised order and the profile saves it once. |
| Open the picker with an empty board | Eight starters are initially suggested. All 61 unique active factors are discoverable. Non-card rows never appear. |
| Drag a new Laundry card and cancel preset selection | No placement is created. Selecting In unit and a lane commits one instance. Adding it again edits the same card. |
| Complete once with a mouse, once with touch and once using only keyboard | All can place, set, move, star, reorder, undo and save. Sheet dismissal returns focus. No horizontal scrolling at 360 px. |
| Move the second of two starred wants to first | It becomes +3, the other becomes +2.25. Moving it into Dealbreaker clears its star and exports `forbid` with null weight. Undo restores both values. |
| Put lower level into Prefer to avoid and then Dealbreaker | Soft weight is negative exactly once. A forbidden condition exports as a hard rule. |
| Save with zero cards or only hard cards | Empty board asks once for confirmation. Both save successfully and serialize without division by zero. |
| Double-click Save; refresh summary; edit just the budget | One stable profile. Other fields, card ranks and weights survive intact. |
| Simulate a failed write | Draft stays available in memory, Retry works when storage recovers, and a successful-save message only follows persistence. |
| Open a later route directly without answers | Navigate to the earliest missing step without discarding valid stored fields. |
| Visual check at 360, 390, 768 and 1440 px; reduced motion on | Readable labels, visible focus, 44 px target goal, no clipped drop targets or fixed-footer overlays; transitions can be disabled. |

Use unit tests for the weight fixtures, duplicate factors, travel ranking validation, serialization and hard-gate transitions. Add one focused browser test for the guest happy path and one for the no-drag path. Scroll, focus, blocked tiles and touch drag need a real browser check. Completion means the profile can be reloaded, edited and handed to the data team, even when there are zero apartment records.

## Appendix. Complete factor catalog for implementation

This appendix lets Astra build the picker even in a checkout without the original CSV. The imported source is [umich-apartment-factor-catalog.csv](https://chatgpt.com/library?file_id=libfile_f3e8a24124ac81919f891209773437be&account_id=personal). If it is present, read only rows with `Record type = Card` as UI factors. Keep the stable IDs and typed values below when translating display labels. Source order controls the initial starter tray. Other placements indicate discovery, and every factor is searchable. For binary cards the stored value is the boolean `true`. For presets, numbers are JSON numbers and enum keys are strings. Their order matches the labels.

**Initial tray, in order:** Commute to my pin · Private bedroom · Apartment size · Private bathroom · Laundry · Furnished · Air conditioning · Heat included.

### Campus trips

| Factor | Stable ID | Control or preset labels | Stored value(s) | Discovery |
|---|---|---|---|---|
| Commute to my pin | `commute_to_my_pin` | 10 / 15 / 20 min max | 10, 15, 20 (minutes max) | Starter |
| Grocery store nearby | `grocery_store_nearby` | 10 / 15 / 20 min max | 10, 15, 20 (minutes max) | Suggested when relevant |
| One-seat ride to my pin | `one_seat_ride_to_my_pin` | One tap | `true` | Suggested when relevant |
| Short walk to my bus stop | `short_walk_to_my_bus_stop` | 5 / 10 min max | 5, 10 (minutes max) | Suggested when relevant |
| Campus library nearby | `campus_library_nearby` | 10 / 15 / 20 min max | 10, 15, 20 (minutes max) | Suggested when relevant |
| Campus gym nearby | `campus_gym_nearby` | 10 / 15 / 20 min max | 10, 15, 20 (minutes max) | Suggested when relevant |

### Space & layout

| Factor | Stable ID | Control or preset labels | Stored value(s) | Discovery |
|---|---|---|---|---|
| Private bedroom | `private_bedroom` | One tap | `true` | Starter |
| Apartment size | `apartment_size` | 500+ / 750+ / 1,000+ sq ft | 500, 750, 1000 (sq ft min) | Starter |
| Private bathroom | `private_bathroom` | One tap | `true` | Starter |
| Whole place to myself | `whole_place_to_myself` | Studio / 1-bedroom | studio, one_bedroom | More factors |
| Bedroom count | `bedroom_count` | 1 / 2 / 3+ bedrooms | one, two, three_or_more | More factors |
| Separate living room | `separate_living_room` | One tap | `true` | More factors |
| Separate dining room | `separate_dining_room` | One tap | `true` | More factors |
| Bonus room or den | `bonus_room_or_den` | One tap | `true` | More factors |
| Bedroom size | `bedroom_size` | 100+ / 120+ / 140+ sq ft | 100, 120, 140 (sq ft min) | More factors |
| Walk-in closet | `walk_in_closet` | One tap | `true` | More factors |
| Extra storage locker | `extra_storage_locker` | One tap | `true` | More factors |
| Desk included | `desk_included` | One tap | `true` | More factors |
| Bedroom has an exterior window | `bedroom_has_an_exterior_window` | One tap | `true` | More factors |
| Floor level | `floor_level` | Lower level / Ground floor / Upper floor | lower_level, ground_floor, upper_floor | More factors |
| Private outdoor space | `private_outdoor_space` | Balcony / Patio | balcony, patio | More factors |
| Type of home | `type_of_home` | House / Small multi-unit house / Apartment building | house, small_multi_unit_house, apartment_building | More factors |
| Bedroom floor surface | `bedroom_floor_surface` | Carpet / Hard surface | carpet, hard_surface | More factors |
| Private entrance | `private_entrance` | One tap | `true` | More factors |

### Home basics

| Factor | Stable ID | Control or preset labels | Stored value(s) | Discovery |
|---|---|---|---|---|
| Laundry | `laundry` | In unit / In building | in_unit, in_building | Starter |
| Furnished | `furnished` | Bedroom furnished / Whole unit furnished | bedroom_furnished, whole_unit_furnished | Starter |
| Air conditioning | `air_conditioning` | One tap | `true` | Starter |
| Dishwasher | `dishwasher` | One tap | `true` | More factors |
| Full oven | `full_oven` | One tap | `true` | More factors |
| Internet included | `internet_included` | One tap | `true` | More factors |
| Bedroom Ethernet | `bedroom_ethernet` | One tap | `true` | More factors |
| Free laundry | `free_laundry` | One tap | `true` | More factors |
| Smoke-free building | `smoke_free_building` | One tap | `true` | More factors |
| Lock on bedroom door | `lock_on_bedroom_door` | One tap | `true` | More factors |

### Bills & lease

| Factor | Stable ID | Control or preset labels | Stored value(s) | Discovery |
|---|---|---|---|---|
| Heat included | `heat_included` | One tap | `true` | Starter |

### Building amenities

| Factor | Stable ID | Control or preset labels | Stored value(s) | Discovery |
|---|---|---|---|---|
| Gym in building | `gym_in_building` | One tap | `true` | More factors |
| Study room in building | `study_room_in_building` | One tap | `true` | More factors |
| Free printing | `free_printing` | One tap | `true` | More factors |
| Package locker | `package_locker` | One tap | `true` | More factors |
| Indoor bike storage | `indoor_bike_storage` | One tap | `true` | Suggested when relevant |
| Elevator | `elevator` | One tap | `true` | More factors |
| Controlled building entry | `controlled_building_entry` | One tap | `true` | More factors |
| Pool | `pool` | One tap | `true` | More factors |
| Hot tub | `hot_tub` | One tap | `true` | More factors |
| Yoga or fitness studio | `yoga_or_fitness_studio` | One tap | `true` | More factors |
| Resident lounge | `resident_lounge` | One tap | `true` | More factors |
| Outdoor hangout | `outdoor_hangout` | Courtyard / Rooftop terrace / BBQ area | courtyard, rooftop_terrace, bbq_area | More factors |
| Trash chute | `trash_chute` | One tap | `true` | More factors |
| 24-hour maintenance contact | `24_hour_maintenance_contact` | One tap | `true` | More factors |

### Cost, lease & household

| Factor | Stable ID | Control or preset labels | Stored value(s) | Discovery |
|---|---|---|---|---|
| Parking space | `parking_space` | Any off-street / Covered | any_off_street, covered | Quick access |
| EV charging | `ev_charging` | One tap | `true` | Suggested when relevant |
| Pet allowed | `pet_allowed` | Cat / Dog | cat, dog | Quick access |
| Individual lease | `individual_lease` | One tap | `true` | More factors |
| Roommate matching offered | `roommate_matching_offered` | One tap | `true` | More factors |
| Academic-term lease | `academic_term_lease` | One tap | `true` | More factors |
| Subletting permitted | `subletting_permitted` | One tap | `true` | More factors |
| Personal guarantor optional | `personal_guarantor_optional` | One tap | `true` | More factors |
| Shared co-op meals | `shared_co_op_meals` | One tap | `true` | More factors |

### Access features

| Factor | Stable ID | Control or preset labels | Stored value(s) | Discovery |
|---|---|---|---|---|
| Step-free route to my unit | `step_free_route_to_my_unit` | One tap | `true` | Quick access |
| Step-free laundry access | `step_free_laundry_access` | One tap | `true` | Quick access |
| Roll-in shower | `roll_in_shower` | One tap | `true` | Quick access |

Select the first two placement examples as a quick implementation check. The saved value for **Laundry · In unit** is `in_unit`. The saved value for **Apartment size · 750+ sq ft** is the number `750`. Both retain the chosen value when a student moves the card into an avoid lane.
