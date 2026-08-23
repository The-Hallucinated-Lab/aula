/**
 * Constraint catalogue — assembly.
 *
 * Joins the fifteen domains with their verbatim rows and produces the flat,
 * validated `CATALOGUE` array the rest of the app consumes.
 */

import type { ConstraintDef, DomainMeta, Row } from './types'
import {
  UNIVERSAL,
  WORKLOAD,
  INSTRUCTOR_PREFS,
  COHORT,
  CURRICULUM,
  GRID,
  ROOM_TYPES,
  EQUIPMENT,
  GEOGRAPHY,
  LOGISTICS,
  ACCESSIBILITY,
  DEPARTMENTAL,
  EXAMS,
  ENERGY,
} from './rows1'
import { GRANULAR_A } from './rows2'
import { GRANULAR_B } from './rows3'

export const DOMAINS: DomainMeta[] = [
  {
    id: 'universal',
    numeral: 'I',
    name: 'Universal hard constraints',
    blurb: 'The rules that make a timetable a timetable. None of these bend.',
    defaultHard: true,
    range: [1, 10],
  },
  {
    id: 'workload',
    numeral: 'II',
    name: 'Instructor workload & legal',
    blurb: 'Contractual caps, union limits, rest periods and statutory duties.',
    defaultHard: true,
    range: [11, 30],
  },
  {
    id: 'prefs',
    numeral: 'III',
    name: 'Instructor preferences',
    blurb: 'What staff would like. Weighted, never guaranteed.',
    defaultHard: false,
    range: [31, 40],
  },
  {
    id: 'cohort',
    numeral: 'IV',
    name: 'Student cohort & pathway',
    blurb: 'A batch can only be in one place, and its week has to be humane.',
    defaultHard: true,
    range: [41, 60],
  },
  {
    id: 'curriculum',
    numeral: 'V',
    name: 'Course & curriculum sequencing',
    blurb: 'Order, blocks and pedagogy — labs after lectures, workshops uninterrupted.',
    defaultHard: true,
    range: [61, 80],
  },
  {
    id: 'grid',
    numeral: 'VI',
    name: 'Standard time blocks & grid rules',
    blurb: 'Keeping every class on a common grid so slots do not fragment.',
    defaultHard: true,
    range: [81, 90],
  },
  {
    id: 'roomtypes',
    numeral: 'VII',
    name: 'Room types & physical capabilities',
    blurb: 'Matching a session to a room that can physically host it.',
    defaultHard: true,
    range: [91, 110],
  },
  {
    id: 'equipment',
    numeral: 'VIII',
    name: 'Specialised equipment & IT',
    blurb: 'Feature-level requirements — from fume hoods to Bloomberg terminals.',
    defaultHard: true,
    range: [111, 125],
  },
  {
    id: 'geography',
    numeral: 'IX',
    name: 'Campus geography & travel times',
    blurb: 'Nobody teleports. Distance costs minutes and the grid must pay them.',
    defaultHard: true,
    range: [126, 135],
  },
  {
    id: 'logistics',
    numeral: 'X',
    name: 'Maintenance, setup & logistics',
    blurb: 'Turnover, teardown, cleaning and lockouts between bookings.',
    defaultHard: true,
    range: [136, 145],
  },
  {
    id: 'accessibility',
    numeral: 'XI',
    name: 'Accessibility & inclusivity',
    blurb: 'ADA compliance, interpreters, prayer windows, sensory needs.',
    defaultHard: true,
    range: [146, 155],
  },
  {
    id: 'departmental',
    numeral: 'XII',
    name: 'Departmental & administrative',
    blurb: 'Ownership, priority and who may book what, when.',
    defaultHard: true,
    range: [156, 165],
  },
  {
    id: 'exams',
    numeral: 'XIII',
    name: 'Examination constraints',
    blurb: 'Exam-specific seating, clustering and invigilation rules.',
    defaultHard: true,
    range: [166, 175],
  },
  {
    id: 'energy',
    numeral: 'XIV',
    name: 'Financial, environmental & energy',
    blurb: 'Consolidation and cost — the constraints the bursar cares about.',
    defaultHard: false,
    range: [176, 180],
  },
  {
    id: 'granular',
    numeral: 'XV',
    name: 'Granular sub-constraints & nuances',
    blurb: 'The long tail: 320 operational details that decide whether a week actually works.',
    defaultHard: true,
    range: [181, 500],
  },
]

/** Sub-buckets used inside the granular domain (and reused as facets). */
export const TOPICS: { id: string; name: string }[] = [
  { id: 'general', name: 'General' },
  { id: 'transitions', name: 'Transitions & travel' },
  { id: 'student-policy', name: 'Student policy' },
  { id: 'staffing', name: 'Staffing' },
  { id: 'quality', name: 'Teaching quality' },
  { id: 'adjacency', name: 'Noise & adjacency' },
  { id: 'facilities', name: 'Facilities' },
  { id: 'specialised', name: 'Specialised spaces' },
  { id: 'it', name: 'IT & software' },
  { id: 'accessibility', name: 'Accessibility' },
  { id: 'safety', name: 'Safety' },
  { id: 'emergency', name: 'Emergency' },
  { id: 'events', name: 'Events & ceremonies' },
  { id: 'exams', name: 'Examinations' },
  { id: 'compliance', name: 'Compliance' },
  { id: 'governance', name: 'Governance' },
  { id: 'platform', name: 'Platform & process' },
]

export const TOPIC_NAME = new Map(TOPICS.map(t => [t.id, t.name]))

const DOMAIN_ROWS: [string, Row[]][] = [
  ['universal', UNIVERSAL],
  ['workload', WORKLOAD],
  ['prefs', INSTRUCTOR_PREFS],
  ['cohort', COHORT],
  ['curriculum', CURRICULUM],
  ['grid', GRID],
  ['roomtypes', ROOM_TYPES],
  ['equipment', EQUIPMENT],
  ['geography', GEOGRAPHY],
  ['logistics', LOGISTICS],
  ['accessibility', ACCESSIBILITY],
  ['departmental', DEPARTMENTAL],
  ['exams', EXAMS],
  ['energy', ENERGY],
  ['granular', GRANULAR_A],
  ['granular', GRANULAR_B],
]

const pad = (n: number) => `C${String(n).padStart(3, '0')}`

function build(): ConstraintDef[] {
  const out: ConstraintDef[] = []
  const domainById = new Map(DOMAINS.map(d => [d.id, d]))

  for (const [domainId, rows] of DOMAIN_ROWS) {
    const domain = domainById.get(domainId)
    if (!domain) throw new Error(`Catalogue references unknown domain "${domainId}"`)

    for (const row of rows) {
      const [n, text] = row
      const opts = row.length === 3 ? row[2] : undefined
      const hard = opts?.soft ? false : opts?.hard ? true : domain.defaultHard

      out.push({
        id: pad(n),
        n,
        text,
        domainId,
        topic: opts?.topic ?? defaultTopic(domainId),
        hard,
        // `rule` and `args` are optional. An advisory row has no rule at all,
        // which is not the same as having one set to undefined — `isImplemented`
        // and the export both read the key's presence.
        ...(opts?.rule === undefined ? {} : { rule: opts.rule }),
        ...(opts?.args === undefined ? {} : { args: opts.args }),
        params: opts?.params ?? [],
      })
    }
  }

  out.toSorted((a, b) => a.n - b.n)
  return out
}

function defaultTopic(domainId: string): string {
  switch (domainId) {
    case 'prefs':
    case 'workload':
      return 'staffing'
    case 'cohort':
      return 'student-policy'
    case 'roomtypes':
    case 'equipment':
      return 'specialised'
    case 'geography':
      return 'transitions'
    case 'logistics':
      return 'facilities'
    case 'accessibility':
      return 'accessibility'
    case 'departmental':
      return 'governance'
    case 'exams':
      return 'exams'
    case 'energy':
      return 'facilities'
    case 'grid':
    case 'curriculum':
      return 'quality'
    default:
      return 'general'
  }
}

export const CATALOGUE: ConstraintDef[] = build()

export const BY_ID = new Map(CATALOGUE.map(c => [c.id, c]))
export const BY_N = new Map(CATALOGUE.map(c => [c.n, c]))

/**
 * Integrity check — run at module load in development so a mis-typed ordinal
 * or a duplicated row fails loudly instead of silently dropping a constraint.
 */
export function auditCatalogue(): string[] {
  const problems: string[] = []
  const seen = new Set<number>()

  for (const c of CATALOGUE) {
    if (seen.has(c.n)) problems.push(`Duplicate constraint ordinal ${c.n}`)
    seen.add(c.n)
    if (!c.text.trim()) problems.push(`Constraint ${c.id} has empty text`)
  }
  for (let i = 1; i <= 500; i++) {
    if (!seen.has(i)) problems.push(`Missing constraint ${i}`)
  }
  if (CATALOGUE.length !== 500) {
    problems.push(`Catalogue holds ${CATALOGUE.length} entries, expected 500`)
  }
  for (const d of DOMAINS) {
    const rows = CATALOGUE.filter(c => c.domainId === d.id)
    const outside = rows.filter(c => c.n < d.range[0] || c.n > d.range[1])
    for (const c of outside) {
      problems.push(`${c.id} sits in domain ${d.id} but outside its range ${d.range.join('–')}`)
    }
  }
  return problems
}

/* ------------------------------------------------------------------ *
 * Headline counts, used across the UI so the numbers always agree
 * ------------------------------------------------------------------ */

export const COUNTS = {
  total: CATALOGUE.length,
  hard: CATALOGUE.filter(c => c.hard).length,
  soft: CATALOGUE.filter(c => !c.hard).length,
  enforced: CATALOGUE.filter(c => c.rule).length,
  advisory: CATALOGUE.filter(c => !c.rule).length,
  parameterised: CATALOGUE.filter(c => c.params.length > 0).length,
}
