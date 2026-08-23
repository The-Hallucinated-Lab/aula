/**
 * Diagnose one saved project: is an unplaced meeting a time-budget problem or a
 * structurally impossible demand?
 *
 *   node node_modules/.tmp/diagnose.mjs <path-to-project.json>
 */

import { readFileSync } from 'node:fs'
import { summarise, slotsPerDay } from '../src/data/config'
import { normaliseConfig } from '../src/data/normalise'
import { generateInstitution } from '../src/data/generator'
import { solve } from '../src/engine/solver'
import { buildDefaultStates } from './shared'

const file = process.argv[2]
const project = JSON.parse(readFileSync(file, 'utf-8')) as { config: unknown }
const cfg = normaliseConfig(project.config)
const states = buildDefaultStates()

console.log(`\nProject: ${cfg.institution.name}\n`)

const summary = summarise(cfg)
console.log('What the app currently tells the user:')
console.log(`  errors   : ${summary.errors.length}`)
for (const e of summary.errors) console.log(`     - ${e}`)
console.log(`  warnings : ${summary.warnings.length}`)
for (const w of summary.warnings) console.log(`     - ${w}`)
console.log(
  `  pressure : ${(summary.pressure * 100).toFixed(0)}%  (${summary.demand} sessions into ${summary.roomSlotsPerWeek} room-slots)\n`,
)

const inst = generateInstitution(cfg)
const perDay = slotsPerDay(cfg.calendar)
const days = cfg.calendar.workingDays.length

/* --- demand vs supply, split by room kind: the check summarise() lacks --- */
console.log('Demand vs supply per room kind:')
const demandByKind = new Map<string, number>()
for (const cohort of inst.cohorts) {
  for (const c of inst.courses) {
    if (c.programId !== cohort.programId || c.year !== cohort.year || c.suspended) continue
    const slots = c.weekly * c.blockLength
    demandByKind.set(c.roomKind, (demandByKind.get(c.roomKind) ?? 0) + slots)
  }
}
const supplyByKind = new Map<string, number>()
for (const r of inst.rooms) {
  if (r.restricted) continue
  supplyByKind.set(r.kind, (supplyByKind.get(r.kind) ?? 0) + days * perDay)
}
let impossible = false
for (const [kind, need] of [...demandByKind].toSorted((a, b) => b[1] - a[1])) {
  const have = supplyByKind.get(kind) ?? 0
  const over = need > have
  if (over) impossible = true
  console.log(
    `  ${kind.padEnd(14)} needs ${String(need).padStart(5)} slot-hours, ${String(have).padStart(5)} available  ${over ? '<-- IMPOSSIBLE' : 'ok'}`,
  )
}
console.log('')

/* --- is it the clock, or the shape of the institution? --- */
for (const budget of [20_000, 60_000]) {
  const report = solve({ institution: inst, states, custom: [], seed: 7, timeBudgetMs: budget })
  const missing = report.unplaced.reduce((a, u) => a + u.missing, 0)
  console.log(
    `budget ${String(budget / 1000).padStart(3)}s -> placed ${report.placed}/${report.requested}, unplaced ${missing}, elapsed ${report.elapsedMs} ms`,
  )
  if (budget === 60_000) {
    console.log('\n  top reasons given to the user:')
    for (const u of report.unplaced.slice(0, 6)) {
      console.log(`    ${u.courseLabel} (${u.cohortLabel}) x${u.missing} — ${u.reason}`)
    }
  }
}
console.log(
  `\nverdict: ${
    impossible
      ? 'the configuration asks for more room-time of some kind than exists — no time budget can fix it'
      : 'demand fits supply; unplaced meetings are a solver/time problem'
  }\n`,
)
