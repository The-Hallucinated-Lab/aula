/**
 * Assistant grounding.
 *
 * Turns a solved schedule into a compact, factual briefing and pairs it with
 * the instruction that confines the model to it. Both halves are domain
 * knowledge, so both live here.
 *
 * Transport is deliberately absent. Reaching a model server is a host concern
 * — under Electron it is a main-process relay, because the packaged renderer's
 * origin is `file://` and a local server rejects it on CORS. Putting `fetch`
 * in this module would tie the domain to one host and cost the package its
 * ability to run headless in the verification harness.
 */

import type { ConstraintDef } from '../data/constraints/types'
import type { Institution, SolveReport } from '../data/model'
import { DAY_NAMES } from '../data/model'

/**
 * The model Aula asks for by name. The caller falls back to whatever the local
 * server actually has installed; this is a preference, not a requirement.
 */
export const DEFAULT_MODEL = 'gemma4:e4b'

/* ------------------------------------------------------------------ *
 * Briefing
 * ------------------------------------------------------------------ */

export interface BriefingInput {
  institution: Institution
  report: SolveReport | null
  /** catalogue entries the user has switched off */
  disabled: ConstraintDef[]
  staffLoad: Map<string, number>
}

/**
 * A compact factual summary of the current schedule.
 *
 * Deliberately bounded: an 8B model with a small context window answers a
 * tight briefing far better than a full data dump, and a dump of 360 sessions
 * would crowd out the question itself.
 */
export function buildBriefing(input: BriefingInput): string {
  const { institution: inst, report } = input
  const grid = inst.grid
  const lines: string[] = []

  lines.push('INSTITUTION')
  lines.push(`Departments: ${inst.departments.map(d => d.code).join(', ')}`)
  lines.push(`Cohorts (${inst.cohorts.length}): ${inst.cohorts.map(c => c.name).join(', ')}`)
  lines.push(
    `Rooms: ${inst.rooms.length}. Staff: ${inst.staff.length}. Courses: ${inst.courses.length}.`,
  )
  lines.push(`Teaching days: ${grid.days.map(d => DAY_NAMES[d]).join(', ')}`)
  lines.push(`Slots per day: ${grid.slots} starting ${grid.labels.join(', ')}`)
  lines.push('')

  if (!report) {
    lines.push('SCHEDULE: none has been generated yet.')
    return lines.join('\n')
  }

  lines.push('SCHEDULE')
  lines.push(
    `${report.placed} of ${report.requested} required meetings placed in ${report.elapsedMs} ms.`,
  )
  lines.push(`Unplaced groups: ${report.unplaced.length}.`)
  if (report.unplaced.length > 0) {
    for (const u of report.unplaced.slice(0, 8)) {
      lines.push(
        `  - ${u.courseLabel} for ${u.cohortLabel}: ${u.missing} missing. Reason: ${u.reason}`,
      )
    }
  }
  lines.push('')

  lines.push('CONSTRAINTS THAT REFUSED THE MOST PLACEMENTS')
  for (const b of report.bottlenecks.slice(0, 6)) {
    lines.push(`  ${b.code} refused ${b.blocked} candidates — ${b.label}`)
  }
  lines.push('')

  if (input.disabled.length > 0) {
    lines.push(
      `SWITCHED OFF (${input.disabled.length}): ${input.disabled
        .slice(0, 12)
        .map(c => c.id)
        .join(', ')}`,
    )
    lines.push('')
  }

  const loads = inst.staff
    .map(f => ({
      name: f.name,
      rank: f.rank,
      hours: input.staffLoad.get(f.id) ?? 0,
      cap: f.maxPerWeek,
    }))
    .sort((a, b) => b.hours - a.hours)
  lines.push('BUSIEST STAFF')
  for (const l of loads.slice(0, 8))
    lines.push(`  ${l.name} (${l.rank}): ${l.hours} of ${l.cap} hours`)
  lines.push('')

  lines.push('COHORT TIMETABLES')
  for (const cohort of inst.cohorts) {
    const mine = report.sessions.filter(s => s.cohortId === cohort.id)
    if (mine.length === 0) continue
    const byDay = grid.days
      .map(day => {
        const onDay = mine
          .filter(s => s.day === day)
          .sort((a, b) => a.slot - b.slot)
          .map(s => {
            const c = inst.courses.find(x => x.id === s.courseId)
            const r = inst.rooms.find(x => x.id === s.roomId)
            const f = inst.staff.find(x => x.id === s.staffId)
            return `${grid.labels[s.slot]} ${c?.code ?? '?'} (${r?.name ?? 'no room'}, ${f?.name ?? 'unstaffed'})`
          })
        return onDay.length ? `    ${DAY_NAMES[day]}: ${onDay.join('; ')}` : null
      })
      .filter(Boolean)
    lines.push(`  ${cohort.name} — ${mine.length} sessions, ${cohort.size} students`)
    lines.push(...(byDay as string[]))
  }

  return lines.join('\n')
}

/* ------------------------------------------------------------------ *
 * Grounding prompt
 * ------------------------------------------------------------------ */

const SYSTEM_RULES = `You are the assistant inside Aula, a university timetable planner.

Answer ONLY from the BRIEFING below. It is the complete truth about this schedule.
If the briefing does not contain the answer, say so plainly and suggest what the user
could look at instead. Never invent a number, a name, a room or a time.

Style: British English, plain and factual, no marketing language. Two to six sentences
unless a list is genuinely clearer. Quote codes and figures exactly as they appear.`

/**
 * The complete system message for a grounded answer.
 *
 * Prompt and briefing are built together here so a caller cannot ship the
 * briefing without the instruction that constrains the model to it. An
 * ungrounded model asked about a timetable will happily invent room numbers.
 */
export function systemPrompt(briefing: string): string {
  return `${SYSTEM_RULES}

--- BRIEFING START ---
${briefing}
--- BRIEFING END ---`
}
