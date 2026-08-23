/**
 * Rule registry.
 *
 * One entry per enforced constraint family. `check` gates hard placements,
 * `cost` scores soft preferences, `audit` catches whole-schedule properties.
 *
 * Rules never read the catalogue text — they read parameters. That is what
 * lets an administrator change "minimum overnight rest" from 12 h to 10 h
 * without anybody touching this file.
 *
 * The 124 rules live in `rules/`, one module per subject, because a single
 * 1,465-line object is navigable only by search. This file is the composition
 * point and the two questions the rest of the application asks of it: is a
 * given rule implemented, and which referenced keys are not.
 */

import type { RuleKey } from '../data/constraints/types'
import type { RuleImpl } from './context'
import type { Session } from '../data/model'
import { AvailabilityRules } from './rules/availability'
import { StaffWorkloadRules } from './rules/staff-workload'
import { StaffPreferencesRules } from './rules/staff-preferences'
import { CohortRules } from './rules/cohort'
import { SequencingRules } from './rules/sequencing'
import { RoomsRules } from './rules/rooms'
import { GeographyRules } from './rules/geography'
import { AccessibilityRules } from './rules/accessibility'
import { AdministrativeRules } from './rules/administrative'
import { QualityRules } from './rules/quality'

/**
 * Every implemented rule, keyed by the name a catalogue row references.
 *
 * Spread order is presentational only — the keys are disjoint across modules,
 * which `npm run verify` re-checks by counting them.
 */
export const RULES: Partial<Record<RuleKey, RuleImpl>> = {
  ...AvailabilityRules, // resource exclusivity & availability (13)
  ...StaffWorkloadRules, // staff workload & legal (20)
  ...StaffPreferencesRules, // staff preferences (soft) (9)
  ...CohortRules, // cohort & pathway (12)
  ...SequencingRules, // curriculum sequencing (15)
  ...RoomsRules, // rooms, features & equipment (11)
  ...GeographyRules, // geography & travel (6)
  ...AccessibilityRules, // accessibility (11)
  ...AdministrativeRules, // departmental & administrative (9)
  ...QualityRules, // scheduling quality & policy (18)
}

/** Rule keys that actually have an implementation right now. */
export const IMPLEMENTED = new Set<RuleKey>(Object.keys(RULES) as RuleKey[])

export const isImplemented = (rule?: RuleKey): boolean => !!rule && IMPLEMENTED.has(rule)

/** Report rule keys referenced by the catalogue but not implemented here. */
export function unimplementedRules(referenced: (RuleKey | undefined)[]): RuleKey[] {
  const missing = new Set<RuleKey>()
  for (const r of referenced) if (r && !IMPLEMENTED.has(r)) missing.add(r)
  return [...missing]
}

export type { RuleImpl }
export type { Session }
