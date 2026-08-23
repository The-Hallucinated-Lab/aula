/**
 * Generator — turns a `SetupConfig` into a schedulable `Institution`.
 *
 * Two rules govern everything behind this file:
 *
 *  1. Never emit a structurally impossible demand. If no configured room has a
 *     fume hood, no course is given a fume-hood requirement. The solver should
 *     fail on real scarcity, never on generator fiction, because the
 *     explanation the app gives the user is only as true as its inputs.
 *  2. Anything the user has edited wins. Once an entity type has explicit
 *     records the generator stops inventing it (D-22).
 *
 * The parts: the time grid, the name banks, the institution builder itself, the
 * roster, the distribution arithmetic, and the record-driven mappers.
 */

export * from './generator/grid'
export * from './generator/naming'
export * from './generator/institution'
export * from './generator/staff'
export * from './generator/distribution'
export * from './generator/from-records'
