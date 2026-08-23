/**
 * Generator — turns a `SetupConfig` into a schedulable `Institution`.
 *
 * Two rules govern this file:
 *  1. Deterministic. The same config and seed always produce the same
 *     institution, so a saved project reopens identically.
 *  2. Never emit a structurally impossible demand. If the configured rooms
 *     have no fume hood, no course is given a fume-hood requirement — the
 *     solver should fail on real scarcity, never on generator fiction.
 */

import { type Building, type Department, type RoomFeature } from '../model'

/**
 * Sharing a fixed headcount across departments, and naming rooms.
 *
 * Largest-remainder so the parts sum to the whole, weighted by the teaching
 * each department must actually cover rather than by how many courses it owns.
 * Deterministic: no randomness, so a seeded institution is reproducible.
 */

/**
 * Decide which department each of the `total` staff places belongs to, in
 * proportion to `weight` (the teaching each department must actually cover).
 *
 * Largest-remainder keeps the parts summing to the whole, and the places are
 * then dealt round-robin rather than in per-department blocks, so that a
 * rank-ordered caller list spreads every rank evenly across departments.
 * Deterministic and free of randomness.
 */
/** Where a staff member lands when the institution has no department to put them in. */
export const FALLBACK_DEPT_ID = 'dept-GEN'

export function dealByDemand(
  departments: Department[],
  weight: Map<string, number>,
  total: number,
  avgCap: number,
): string[] {
  if (departments.length === 0 || total <= 0) {
    return Array.from({ length: Math.max(0, total) }, () => FALLBACK_DEPT_ID)
  }

  const teaching = departments.filter(d => (weight.get(d.id) ?? 0) > 0)
  const pool = teaching.length > 0 ? teaching : departments
  /* Cover each department's hours first, rounding UP: proportional shares get
     floored, and a department one body short of its own teaching cannot cover
     it however comfortable the institution looks in aggregate. */
  const counts = new Map(
    pool.map(d => [d.id, Math.max(1, Math.ceil((weight.get(d.id) ?? 0) / Math.max(1, avgCap)))]),
  )
  let assigned = [...counts.values()].reduce((a, b) => a + b, 0)

  // Genuinely short-staffed: scale everyone back proportionally and let
  // summarise() tell the user, rather than starving whoever sorts last.
  while (assigned > total) {
    const biggest = [...counts.entries()].toSorted((a, b) => b[1] - a[1])[0]
    if (!biggest || biggest[1] <= 1) break
    counts.set(biggest[0], biggest[1] - 1)
    assigned--
  }
  /* Spare staff are shared out in proportion to teaching, not one each in turn:
     round-robin flattens the roster and leaves the heaviest department with
     less than its share while the lightest sits on people it cannot use. */
  const surplus = total - assigned
  if (surplus > 0) {
    const sum = pool.reduce((a, d) => a + (weight.get(d.id) ?? 0), 0) || pool.length
    const shares = pool.map(d => ({
      id: d.id,
      want: ((weight.get(d.id) ?? 1) / sum) * surplus,
    }))
    for (const sh of shares) {
      const whole = Math.floor(sh.want)
      counts.set(sh.id, (counts.get(sh.id) ?? 0) + whole)
      assigned += whole
    }
    const byRemainder = shares
      .map(sh => ({ id: sh.id, rem: sh.want - Math.floor(sh.want) }))
      .toSorted((a, b) => b.rem - a.rem)
    for (let k = 0; assigned < total && byRemainder.length > 0; k++) {
      const next = byRemainder[k % byRemainder.length]
      if (!next) break
      counts.set(next.id, (counts.get(next.id) ?? 0) + 1)
      assigned++
    }
  }

  const order = pool.map(d => d.id).filter(id => (counts.get(id) ?? 0) > 0)
  const slots: string[] = []
  let cursor = 0
  while (slots.length < total && order.length > 0) {
    let looked = 0
    while ((counts.get(order[cursor % order.length] ?? '') ?? 0) === 0 && looked <= order.length) {
      cursor++
      looked++
    }
    if (looked > order.length) break
    const id = order[cursor % order.length]
    if (id === undefined) break
    counts.set(id, (counts.get(id) ?? 0) - 1)
    slots.push(id)
    cursor++
  }
  while (slots.length < total) slots.push(pool[0]?.id ?? FALLBACK_DEPT_ID)
  slots.length = total
  return slots
}

const FEATURE_SET = new Set<string>([
  'tiered',
  'flatFloor',
  'movableFurniture',
  'fixedSeating',
  'centralTable',
  'wetLab',
  'fumeHood',
  'computers',
  'macLab',
  'windowsLab',
  'sprungFloor',
  'mirrors',
  'acoustic',
  'grandPiano',
  'makerSpace',
  'draftingTables',
  'biosafety',
  'gymnasium',
  'projectorHiRes',
  'dualProjection',
  'lectureCapture',
  'mootCourt',
  'mediaStudio',
  'kitchen',
  'observatory',
  'auditorium',
  'groundFloor',
  'reinforcedFloor',
  'soundproof',
  'blackoutBlinds',
  'threeDPrinters',
  'languageLab',
  'vrTracking',
  'esports',
  'financeTerminals',
  'colorCalibrated',
  'medicalDisplays',
  'animalSafe',
  'twoWayMirror',
  'floorDrains',
  'ventilation',
  'wiredNetwork',
  'hyflex',
  'chalkboard',
  'wrapWhiteboard',
  'largeDesks',
  'podTables',
  'cleanRoom',
  'emiShielded',
  'wheelchairAccess',
  'adjustablePodium',
  'brailleSignage',
  'lowStimulus',
])

export const isFeature = (s: string): s is RoomFeature => FEATURE_SET.has(s)

function abbreviate(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(word => word !== '')
    .map(word => word[0] ?? '')
  if (initials.length >= 2) return `${initials[0]}${initials[1]}`.toUpperCase()
  return (name.slice(0, 2) || 'BL').toUpperCase()
}

/**
 * One unique room-name prefix per building. Two buildings can easily
 * abbreviate to the same pair of letters ("Lab Complex", "Lecture Centre"),
 * which would put identical room names on opposite sides of the campus.
 */
export function buildingPrefixes(buildings: Building[]): Map<string, string> {
  const used = new Set<string>()
  const out = new Map<string, string>()
  for (const b of buildings) {
    const base = abbreviate(b.name)
    let prefix = base
    let n = 2
    while (used.has(prefix)) prefix = `${base}${n++}`
    used.add(prefix)
    out.set(b.id, prefix)
  }
  return out
}
