// Leasing timeline computed from a student's move-in date. No listing data needed: every milestone comes from
// the student's own dates and a cited Ann Arbor or Michigan rule.

export interface Source { label: string; url: string }
export interface Milestone {
  id: string
  date: string // YYYY-MM-DD
  title: string
  detail: string
  source?: Source
  status: 'done' | 'next' | 'upcoming'
}
export interface TimelineInput {
  moveIn: string // YYYY-MM-DD
  today: string // YYYY-MM-DD
  currentLeaseStart?: string | null // YYYY-MM-DD, only if the student rents in Ann Arbor now
  monthlyRent?: number | null // dollars per person
}

export const SOURCES = {
  renew: {
    label: 'City of Ann Arbor · Right to Renew guide (Chapter 105, §8:530)',
    url: 'https://www.a2gov.org/media/toeestqe/rtr-4-10-2024.pdf',
  },
  deposit: { label: 'Michigan law · MCL 554.602', url: 'https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-554-602' },
  depositNotice: { label: 'Michigan law · MCL 554.603', url: 'https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-554-603' },
  checklist: { label: 'Michigan law · MCL 554.608', url: 'https://www.legislature.mi.gov/Laws/MCL?objectName=MCL-554-608' },
} satisfies Record<string, Source>

// Ann Arbor Chapter 105 (leases of 8+ months entered after March 17, 2024).
export const RENEWAL_OFFER_DAY = 180
export const SHOWING_DAY = 210
export const RESPONSE_DAYS = 30
export const DEPOSIT_MONTHS = 1.5
export const CHECKLIST_DAYS = 7
export const DEPOSIT_NOTICE_DAYS = 14

const DAY = 86_400_000
const parse = (iso: string) => Date.parse(iso + 'T00:00:00Z')
export const addDays = (iso: string, days: number) => new Date(parse(iso) + days * DAY).toISOString().slice(0, 10)
export const addYears = (iso: string, years: number) => {
  const d = new Date(parse(iso))
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().slice(0, 10)
}
export const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parse(value))

const money = (dollars: number) => '$' + Math.round(dollars).toLocaleString('en-US')

export function buildTimeline({ moveIn, today, currentLeaseStart, monthlyRent }: TimelineInput): Milestone[] {
  // Units for a given move-in are usually held by tenants whose lease started about a year earlier.
  const occupiedSince = addYears(moveIn, -1)
  const showing = addDays(occupiedSince, SHOWING_DAY)
  const rows: Omit<Milestone, 'status'>[] = [
    {
      id: 'brief',
      date: today,
      title: 'Build your housing brief',
      detail: 'Set your budget, pin where you go most and rank what matters, so you are ready to compare places when they open.',
    },
    {
      id: 'renewals',
      date: addDays(occupiedSince, RENEWAL_OFFER_DAY),
      title: 'Current tenants get renewal offers',
      detail: `Landlords must offer renewals ${RENEWAL_OFFER_DAY} days into a lease, and tenants get at least ${RESPONSE_DAYS} days to answer. Places they turn down open up next.`,
      source: SOURCES.renew,
    },
    {
      id: 'showings',
      date: showing,
      title: 'Tours and signing open for occupied units',
      detail: `A landlord can’t show an occupied unit or lease it to someone new until ${SHOWING_DAY} days into the current lease. Places with no current tenant, like new buildings, aren’t held back by this rule.`,
      source: SOURCES.renew,
    },
    {
      id: 'deposit',
      date: showing,
      title: 'Have your deposit ready',
      detail:
        `Michigan caps a security deposit at ${DEPOSIT_MONTHS} months’ rent` +
        (monthlyRent && monthlyRent > 0
          ? `, so plan for up to ${money(monthlyRent * DEPOSIT_MONTHS)} at ${money(monthlyRent)} a month.`
          : '. Add your monthly rent to see your number.'),
      source: SOURCES.deposit,
    },
    { id: 'move-in', date: moveIn, title: 'Move in', detail: 'Ask for two blank inventory checklists when you get the keys.', source: SOURCES.checklist },
    {
      id: 'checklist',
      date: addDays(moveIn, CHECKLIST_DAYS),
      title: 'Return your inventory checklist',
      detail: `Note the condition of every room and return one copy within ${CHECKLIST_DAYS} days. It protects your deposit when you move out.`,
      source: SOURCES.checklist,
    },
    {
      id: 'deposit-notice',
      date: addDays(moveIn, DEPOSIT_NOTICE_DAYS),
      title: 'Expect your deposit notice',
      detail: `Your landlord must give you, in writing, where to send deposit communications within ${DEPOSIT_NOTICE_DAYS} days of move-in.`,
      source: SOURCES.depositNotice,
    },
  ]
  if (currentLeaseStart) {
    rows.push(
      {
        id: 'my-renewal',
        date: addDays(currentLeaseStart, RENEWAL_OFFER_DAY),
        title: 'Your renewal offer arrives',
        detail: `If you might stay, you’ll have at least ${RESPONSE_DAYS} days to answer. Decide before your landlord can start showing your place.`,
        source: SOURCES.renew,
      },
      {
        id: 'my-showings',
        date: addDays(currentLeaseStart, SHOWING_DAY),
        title: 'Your landlord can start showing your unit',
        detail: 'From here your current place can be shown and leased to someone else.',
        source: SOURCES.renew,
      },
    )
  }
  const sorted = rows.sort((a, b) => a.date.localeCompare(b.date) || order(a.id) - order(b.id))
  const next = sorted.findIndex((m) => m.date >= today)
  return sorted.map((m, i) => ({ ...m, status: m.date < today ? 'done' : i === next ? 'next' : 'upcoming' }))
}

/** The first milestone after today other than building the brief, with days until it. */
export function nextKeyDate(milestones: Milestone[], today: string): { milestone: Milestone; days: number } | null {
  const milestone = milestones.find((m) => m.id !== 'brief' && m.date > today)
  return milestone ? { milestone, days: Math.round((parse(milestone.date) - parse(today)) / DAY) } : null
}

const ids = ['brief', 'my-renewal', 'renewals', 'my-showings', 'showings', 'deposit', 'move-in', 'checklist', 'deposit-notice']
const order = (id: string) => ids.indexOf(id)

/** The next mid-August move-in that is at least four months away. */
export function defaultMoveIn(today: string): string {
  const year = Number(today.slice(0, 4))
  const thisYear = `${year}-08-15`
  return thisYear >= addDays(today, 120) ? thisYear : `${year + 1}-08-15`
}
