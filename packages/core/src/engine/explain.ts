/**
 * The deterministic explainer.
 *
 * Answers questions about a solved schedule by reading it. Every sentence it
 * produces is derived from the report, the metrics or the catalogue — it has no
 * model behind it and cannot invent a room number, which is exactly why it is
 * also the fallback when the language model is absent or fails mid-answer.
 *
 * This lived inside `pages/Assistant.tsx`, where it was a hundred lines of
 * domain logic reaching into a Zustand store, untestable without a React tree
 * and unreachable from the harness. It takes a `ScheduleView` now: the same
 * data, named as a port, so the store satisfies it by having the right shape
 * rather than by being imported.
 */

import { CATALOGUE } from '../data/constraints/catalogue'
import type { ConstraintState } from '../data/constraints/types'
import type { Institution, Session, SolveReport } from '../data/model'
import { DAY_NAMES } from '../data/model'
import type { Metrics } from '../data/metrics'
import { isImplemented } from './rules'

/** Everything the explainer needs to answer from. */
export interface ScheduleView {
  institution: Institution
  report: SolveReport | null
  sessions: Session[]
  metrics: Metrics
  states: Record<string, ConstraintState>
}

export interface Explanation {
  text: string
  /** short label for the answer's source, shown as a chip */
  tag?: string
}

export function explainSchedule(question: string, s: ScheduleView): Explanation {
  const lower = question.toLowerCase()

  if (!s.report) {
    return {
      tag: 'No solve yet',
      text: 'There is no solved timetable in memory. Run Setup and generate one, then ask me again.',
    }
  }

  const numMatch = lower.match(/\b(?:constraint\s*|c)?(\d{1,3})\b/)
  if (numMatch && /constraint|rule|what is|explain/.test(lower)) {
    const n = Number(numMatch[1])
    const def = CATALOGUE.find(c => c.n === n)
    if (def) {
      const st = s.states[def.id]
      const settings = def.params.length
        ? ` Current settings: ${def.params.map(p => `${p.label} = ${st?.values[p.key] ?? p.def}${p.unit ?? ''}`).join(', ')}.`
        : ''
      return {
        tag: `Constraint ${def.id}`,
        text: `“${def.text}” It is a ${def.hard ? 'hard' : 'soft'} constraint, currently ${st?.enabled ? 'enabled' : 'disabled'}, and is ${isImplemented(def.rule) ? 'enforced by the engine on every candidate placement' : 'advisory — this build cannot check it from the data model, so it is tracked for human sign-off'}.${settings}`,
      }
    }
  }

  if (/block|bottleneck|hardest|cost|refus/.test(lower)) {
    const top = s.report.bottlenecks.slice(0, 4)
    if (top.length === 0) return { text: 'Nothing blocked a placement in the last solve.' }
    const lines = top.map(
      b => `${b.code} refused ${b.blocked.toLocaleString()} candidate placements — “${b.label}”`,
    )
    const missing = s.report.unplaced.reduce((a, u) => a + u.missing, 0)
    return {
      tag: 'Bottlenecks',
      text: `The rules that refused the most placements were:\n\n${lines.join('\n')}\n\nResource-exclusivity rules always sit near the top; that is normal. It matters only when sessions went unplaced — ${missing === 0 ? 'none did' : `${missing} did`}.`,
    }
  }

  if (/load|busiest|heaviest|overwork|workload/.test(lower)) {
    const ranked = s.institution.staff
      .map(f => ({ f, h: s.metrics.staffLoad.get(f.id) ?? 0 }))
      .toSorted((a, b) => b.h - a.h)
      .slice(0, 4)
    return {
      tag: 'Workload',
      text: `Heaviest teaching loads this week:\n\n${ranked.map(r => `${r.f.name} (${r.f.rank}) — ${r.h} h of a ${r.f.maxPerWeek} h cap`).join('\n')}\n\nSpread across all staff is ±${s.metrics.loadStdDev.toFixed(1)} hours.`,
    }
  }

  if (/room/.test(lower) && /unused|barely|idle|empty|least/.test(lower)) {
    const ranked = s.metrics.roomUsage.toSorted((a, b) => a.used - b.used).slice(0, 5)
    const lines = ranked.map(r => {
      const room = s.institution.rooms.find(x => x.id === r.roomId)
      return `${room?.name ?? r.roomId} (${room?.kind ?? '?'}, ${room?.capacity ?? '?'} seats) — ${r.used} h`
    })
    return { tag: 'Room usage', text: `Least-used rooms this week:\n\n${lines.join('\n')}` }
  }

  if (/tight|pressure|utilis|utiliz|capacity|full/.test(lower)) {
    let bestDay = 0,
      bestSlot = 0,
      best = -1
    s.metrics.heatmap.forEach((row, di) =>
      row.forEach((v, si) => {
        if (v > best) {
          best = v
          bestDay = di
          bestSlot = si
        }
      }),
    )
    const day = s.institution.grid.days[bestDay]
    const dayName = day === undefined ? 'the busiest day' : DAY_NAMES[day]
    return {
      tag: 'Pressure',
      text: `Room utilisation is ${(s.metrics.utilization * 100).toFixed(1)}% across the week. The busiest moment is ${dayName} at ${s.institution.grid.labels[bestSlot]}, with ${best} of ${s.institution.rooms.length} rooms in use.`,
    }
  }

  const cohort = s.institution.cohorts.find(c => lower.includes(c.name.toLowerCase()))
  if (cohort) {
    const mine = s.sessions.filter(x => x.cohortId === cohort.id)
    const dayMatch = DAY_NAMES.findIndex(d => lower.includes(d.toLowerCase()))
    if (dayMatch >= 0) {
      const onDay = mine.filter(x => x.day === dayMatch).toSorted((a, b) => a.slot - b.slot)
      if (onDay.length === 0)
        return {
          tag: cohort.name,
          text: `${cohort.name} has nothing scheduled on ${DAY_NAMES[dayMatch]}.`,
        }
      const lines = onDay.map(x => {
        const c = s.institution.courses.find(y => y.id === x.courseId)
        const r = s.institution.rooms.find(y => y.id === x.roomId)
        const f = s.institution.staff.find(y => y.id === x.staffId)
        return `${s.institution.grid.labels[x.slot]} — ${c?.code} ${c?.name} · ${r?.name ?? 'no room'} · ${f?.name}`
      })
      return {
        tag: cohort.name,
        text: `${DAY_NAMES[dayMatch]} for ${cohort.name}:\n\n${lines.join('\n')}`,
      }
    }
    const hours = mine.reduce((a, x) => a + x.length, 0)
    return {
      tag: cohort.name,
      text: `${cohort.name} has ${mine.length} sessions totalling ${hours} contact hours this week, across ${new Set(mine.map(x => x.day)).size} days. ${cohort.size} students.`,
    }
  }

  if (/unplaced|missing|fail|could not|couldn't/.test(lower)) {
    if (s.report.unplaced.length === 0) {
      return {
        tag: 'Placement',
        text: `Everything fits — all ${s.report.requested} required meetings were placed.`,
      }
    }
    const lines = s.report.unplaced
      .slice(0, 5)
      .map(u => `${u.courseLabel} for ${u.cohortLabel} — ${u.missing} missing. ${u.reason}`)
    return {
      tag: 'Unplaced',
      text: `${s.report.unplaced.length} groups did not fully place:\n\n${lines.join('\n')}`,
    }
  }

  return {
    tag: 'Try asking',
    text: `I answer from the solved schedule, so I need something concrete. Try a cohort name (${s.institution.cohorts
      .slice(0, 3)
      .map(c => c.name)
      .join(
        ', ',
      )}), a constraint number (1–500), or ask what blocked the most placements, who is busiest, or where the week is tightest.`,
  }
}
