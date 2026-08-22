/**
 * Constraint catalogue — type system.
 *
 * The catalogue holds all 500 constraints verbatim. Each one is either
 * ENFORCED (it names a `rule` the engine implements, so the solver actually
 * obeys or scores it) or ADVISORY (no rule — it is tracked, weighted,
 * exported and surfaced for human sign-off, but the engine cannot check it
 * from the data model alone).
 *
 * That distinction is shown in the UI. Nothing here silently pretends to be
 * enforced.
 */

/* ------------------------------------------------------------------ *
 * Rule keys — every key listed here must have an implementation in
 * `src/engine/rules.ts`, which is typed as Record<RuleKey, RuleImpl>.
 * ------------------------------------------------------------------ */

export const RULE_KEYS = [
  // --- resource exclusivity & availability (hard) ---
  'facultyNoOverlap', 'roomNoOverlap', 'cohortNoOverlap', 'roomCapacity',
  'operatingHours', 'buildingMaintenance', 'facultySabbatical', 'courseSuspended',
  'equipmentContention', 'holidayBlackout', 'roomBlocked', 'roomRestricted',

  // --- faculty workload & legal ---
  'facultyMaxWeekly', 'adjunctMaxWeekly', 'taMaxWeekly', 'facultyMaxPerDay',
  'facultyMinRest', 'facultyMaxConsecutive', 'facultyLunch', 'facultyBlockedDays',
  'facultyBlockedSlots', 'facultyAccessibleRoom', 'visitingCampusDays',
  'facultyQualified', 'labSupervisionCap', 'newFacultyLoad', 'newPreparationCap',
  'overtimeAvoid', 'seniorityLoadFloor', 'adjunctSpreadCap', 'taRatio',

  // --- faculty preferences (soft) ---
  'avoidEarlySlot', 'compactTeachingDays', 'sameBuildingPerDay',
  'facultyTimeWindow', 'preferBackToBack', 'preferPrepGap', 'preferDayPart',
  'seniorityPriority', 'minimiseRoomCount', 'consecutiveDayCap',

  // --- cohort & pathway ---
  'cohortMaxConsecutive', 'cohortLunch', 'eveningProgramStart',
  'clusterCohortDays', 'protectedCohortSlots', 'cohortDayPartBalance',
  'cohortMaxGap', 'cohortMinGap', 'firstYearNoNight', 'lateNightCap',
  'earlyStartStreakCap', 'electiveGroupClashFree',

  // --- curriculum sequencing ---
  'labAfterLecture', 'tutorialAfterLecture', 'coursePrerequisiteOrder',
  'linkedCoursesSameDay', 'spreadSectionsAcrossWeek', 'shortBurstsPerWeek',
  'contiguousBlock', 'noRoomNeeded', 'fieldworkFreeDay', 'avoidBackToBackHeavy',
  'rehearsalAfterHours', 'annualOffering',

  // --- grid discipline ---
  'gridAlignment', 'transitionGap', 'reservedFreeHour', 'blockLengthAllowed',
  'creditContactHours', 'gridSlack',

  // --- rooms, features & equipment ---
  'roomKindMatch', 'roomFeatureRequired', 'roomRightSize', 
  'roomTurnover', 'noisyAdjacency', 'roomForbiddenFeature', 'distancingCapacity',
  'noisyBuildingAvoid', 'ventilationPriority', 

  // --- geography & travel ---
  'interCampusTravel', 'walkWindow', 'sameRoomGap', 'crossCampusGap',
  'homeCampusPreference', 'mobilityLocalised', 'rushHourAvoid',

  // --- accessibility & inclusion ---
  'accessibleRoomForCohort', 'elevatorFallbackGroundFloor', 'interpreterSpace',
  'lowStimulusAdjacency', 'religiousHoliday', 'prayerWindow',
  'photosensitiveLighting', 'brailleBuilding', 'adjustablePodium',
  'groundFloorAfterDark', 'equityBlind',

  // --- departmental & administrative ---
  'deptRoomPriority', 'deptAfterHoursOnly', 'megaLectureFirst',
  'lowEnrolmentFlag', 'restrictedSpaces', 'lateNightClustering',
  'manualLock', 'crossListedShared', 'capacityOverrideGuard', 'overflowRoom',

  // --- examinations ---
  

  // --- scheduling quality & policy ---
  'primeHoursFoundational', 'avoidEarlyStem', 'staggerMorningStarts',
  'weekendConsolidation', 'zoneClustering', 'dayFreeReserve',
  'spreadAcrossWeek', 'daylightOnly', 'solarNoon', 'dawnClass', 'nightClass',
  'hybridOnlineNoRoom', 'quietExamAdjacency', 'wellnessHour',
  'gateCurfew', 'solveTimeLimit',
] as const

export type RuleKey = typeof RULE_KEYS[number]

const RULE_SET = new Set<string>(RULE_KEYS)
export const isRuleKey = (s: string): s is RuleKey => RULE_SET.has(s)

/* ------------------------------------------------------------------ *
 * Editable parameters
 * ------------------------------------------------------------------ */

export type ParamValue = number | string | boolean

export interface ParamDef {
  key: string
  label: string
  kind: 'number' | 'time' | 'bool' | 'percent' | 'text'
  def: ParamValue
  min?: number
  max?: number
  step?: number
  unit?: string
}

/* ------------------------------------------------------------------ *
 * Domains — the fifteen operational areas of the source catalogue
 * ------------------------------------------------------------------ */

export interface DomainMeta {
  id: string
  /** roman numeral from the source catalogue */
  numeral: string
  name: string
  blurb: string
  /** default hardness for rows in this domain */
  defaultHard: boolean
  range: [number, number]
}

export interface ConstraintDef {
  /** "C001" — stable id used in reports and exports */
  id: string
  /** ordinal in the source catalogue, 1..500 */
  n: number
  /** the constraint, verbatim */
  text: string
  domainId: string
  /** sub-bucket for the large granular domain */
  topic: string
  hard: boolean
  /** implemented rule; undefined means advisory-only */
  rule?: RuleKey
  /** static arguments the rule needs, e.g. { feature: 'wetLab' } */
  args?: Record<string, ParamValue>
  /** administrator-editable knobs */
  params: ParamDef[]
}

/** Runtime state for one constraint — what the user has changed. */
export interface ConstraintState {
  enabled: boolean
  /** 1..5, meaningful for soft constraints */
  weight: number
  /** current parameter values, keyed by ParamDef.key */
  values: Record<string, ParamValue>
}

export const defaultState = (c: ConstraintDef): ConstraintState => ({
  enabled: true,
  weight: c.hard ? 5 : 3,
  values: Object.fromEntries(c.params.map(p => [p.key, p.def])),
})

/* ------------------------------------------------------------------ *
 * Row shorthand used by the catalogue data files
 * ------------------------------------------------------------------ */

export interface RowOpts {
  /** override the domain default hardness */
  soft?: true
  hard?: true
  rule?: RuleKey
  args?: Record<string, ParamValue>
  params?: ParamDef[]
  topic?: string
}

/** [ordinal, verbatim text, options] */
export type Row = [number, string] | [number, string, RowOpts]

/* --- common parameter shapes, reused across many rows --- */

export const P = {
  hours: (key: string, label: string, def: number, max = 24): ParamDef =>
    ({ key, label, kind: 'number', def, min: 0, max, step: 1, unit: 'h' }),
  minutes: (key: string, label: string, def: number, max = 240): ParamDef =>
    ({ key, label, kind: 'number', def, min: 0, max, step: 5, unit: 'min' }),
  count: (key: string, label: string, def: number, max = 40): ParamDef =>
    ({ key, label, kind: 'number', def, min: 0, max, step: 1 }),
  time: (key: string, label: string, def: string): ParamDef =>
    ({ key, label, kind: 'time', def }),
  percent: (key: string, label: string, def: number): ParamDef =>
    ({ key, label, kind: 'percent', def, min: 0, max: 100, step: 1, unit: '%' }),
  bool: (key: string, label: string, def: boolean): ParamDef =>
    ({ key, label, kind: 'bool', def }),
}
