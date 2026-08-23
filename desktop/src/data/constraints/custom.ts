/**
 * User-defined constraints.
 *
 * The 500-rule catalogue is fixed — it is the published list, and renumbering
 * it would break every report that cites a rule by number. Institution-specific
 * rules therefore live here, numbered U001 upwards, and are evaluated by the
 * same engine in the same pass as the catalogue.
 *
 * Each custom rule is a template plus a scope plus parameters, rather than free
 * text, because a rule the engine cannot evaluate is not a constraint — it is a
 * note. Free-text notes belong in the advisory column of the catalogue.
 */

import type { ParamValue } from './types'

export type CustomTemplate =
  | 'blockSlot'
  | 'dayOff'
  | 'noEarlierThan'
  | 'noLaterThan'
  | 'maxPerDay'
  | 'maxConsecutive'
  | 'requireBuilding'
  | 'avoidBuilding'

export const SCOPE_KINDS = ['all', 'cohort', 'staff', 'department', 'course', 'room'] as const
export type ScopeKind = typeof SCOPE_KINDS[number]

/**
 * Scope kinds saved by builds before the person entity was renamed from
 * `Faculty` to `Staff`. A project file written then carries `kind: 'faculty'`,
 * which no longer matches anything in `inScope` — so without this the rule
 * would load, look intact in the editor and silently never fire.
 */
export const LEGACY_SCOPE_KINDS: Record<string, ScopeKind> = { faculty: 'staff' }

export interface CustomScope {
  kind: ScopeKind
  /** entity id; ignored when kind is 'all' */
  id?: string
}

export interface CustomConstraint {
  /** "U001" — the U prefix keeps these clear of the numbered catalogue */
  id: string
  /** the administrator's own wording, shown verbatim in reports */
  text: string
  template: CustomTemplate
  scope: CustomScope
  hard: boolean
  weight: number
  enabled: boolean
  params: Record<string, ParamValue>
}

export interface TemplateMeta {
  id: CustomTemplate
  name: string
  /** what it does, in one sentence */
  blurb: string
  /** which scopes make sense for this template */
  scopes: ScopeKind[]
  params: {
    key: string
    label: string
    kind: 'day' | 'slot' | 'count' | 'building'
    def: number | string
  }[]
  /** default wording, filled in when the user picks the template */
  phrase: (scopeLabel: string, p: Record<string, ParamValue>) => string
}

const dayName = (n: number) =>
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][n] ?? `day ${n}`

const num = (p: Record<string, ParamValue>, k: string, d = 0) =>
  typeof p[k] === 'number' ? (p[k] as number) : d

export const TEMPLATES: TemplateMeta[] = [
  {
    id: 'blockSlot',
    name: 'Keep a slot free',
    blurb: 'Nothing may be scheduled in one specific slot on one day.',
    scopes: ['all', 'cohort', 'staff', 'department'],
    params: [
      { key: 'day', label: 'Day', kind: 'day', def: 2 },
      { key: 'slot', label: 'Slot', kind: 'slot', def: 4 },
    ],
    phrase: (s, p) => `${s} must keep ${dayName(num(p, 'day'))} slot ${num(p, 'slot') + 1} free.`,
  },
  {
    id: 'dayOff',
    name: 'Keep a whole day free',
    blurb: 'Nothing may be scheduled on one day of the week.',
    scopes: ['all', 'cohort', 'staff', 'department'],
    params: [{ key: 'day', label: 'Day', kind: 'day', def: 4 }],
    phrase: (s, p) => `${s} must not be scheduled on ${dayName(num(p, 'day'))}.`,
  },
  {
    id: 'noEarlierThan',
    name: 'No early starts',
    blurb: 'Nothing may start before a given slot.',
    scopes: ['all', 'cohort', 'staff', 'department', 'course'],
    params: [{ key: 'slot', label: 'Earliest slot', kind: 'slot', def: 1 }],
    phrase: (s, p) => `${s} must not start before slot ${num(p, 'slot') + 1}.`,
  },
  {
    id: 'noLaterThan',
    name: 'No late finishes',
    blurb: 'Nothing may run past a given slot.',
    scopes: ['all', 'cohort', 'staff', 'department', 'course'],
    params: [{ key: 'slot', label: 'Last slot', kind: 'slot', def: 6 }],
    phrase: (s, p) => `${s} must finish by the end of slot ${num(p, 'slot') + 1}.`,
  },
  {
    id: 'maxPerDay',
    name: 'Cap hours per day',
    blurb: 'Limit how many teaching hours land on any single day.',
    scopes: ['cohort', 'staff', 'department'],
    params: [{ key: 'hours', label: 'Maximum hours', kind: 'count', def: 5 }],
    phrase: (s, p) => `${s} must not exceed ${num(p, 'hours')} hours in a day.`,
  },
  {
    id: 'maxConsecutive',
    name: 'Cap consecutive hours',
    blurb: 'Limit back-to-back teaching without a break.',
    scopes: ['cohort', 'staff', 'department'],
    params: [{ key: 'hours', label: 'Maximum consecutive', kind: 'count', def: 3 }],
    phrase: (s, p) => `${s} must not teach or sit more than ${num(p, 'hours')} consecutive hours.`,
  },
  {
    id: 'requireBuilding',
    name: 'Must use a building',
    blurb: 'Confine a cohort, department or course to one building.',
    scopes: ['cohort', 'department', 'course'],
    params: [{ key: 'buildingId', label: 'Building', kind: 'building', def: '' }],
    phrase: s => `${s} must be taught in the selected building.`,
  },
  {
    id: 'avoidBuilding',
    name: 'Must avoid a building',
    blurb: 'Keep a cohort, department or course out of one building.',
    scopes: ['cohort', 'department', 'course'],
    params: [{ key: 'buildingId', label: 'Building', kind: 'building', def: '' }],
    phrase: s => `${s} must not be taught in the selected building.`,
  },
]

export const TEMPLATE_BY_ID = new Map(TEMPLATES.map(t => [t.id, t]))

export function nextCustomId(existing: CustomConstraint[]): string {
  let max = 0
  for (const c of existing) {
    const n = Number(c.id.replace(/^U/, ''))
    if (Number.isFinite(n)) max = Math.max(max, n)
  }
  return `U${String(max + 1).padStart(3, '0')}`
}

export function makeCustom(
  template: CustomTemplate,
  scope: CustomScope,
  existing: CustomConstraint[],
  scopeLabel: string,
): CustomConstraint {
  const meta = TEMPLATE_BY_ID.get(template)!
  const params = Object.fromEntries(meta.params.map(p => [p.key, p.def]))
  return {
    id: nextCustomId(existing),
    text: meta.phrase(scopeLabel, params),
    template,
    scope,
    hard: true,
    weight: 5,
    enabled: true,
    params,
  }
}
