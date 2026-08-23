/**
 * Local assistant.
 *
 * Talks to an Ollama server on this machine — no data leaves the device. The
 * model is given a compact, factual briefing built from the solved schedule and
 * is told to answer only from it. It is not allowed to invent numbers: anything
 * it cannot find in the briefing it must decline.
 *
 * If Ollama is not running, the caller falls back to the deterministic
 * explainer. The assistant is an extra, never a dependency.
 */

import type { ConstraintDef } from '../data/constraints/types'
import type { Institution, SolveReport } from '../data/model'
import { DAY_NAMES } from '../data/model'

const HOST = 'http://localhost:11434'
export const DEFAULT_MODEL = 'gemma4:e4b'

export interface AssistantStatus {
  available: boolean
  models: string[]
  model: string | null
  error?: string
}

/** Is Ollama up, and is a usable model installed? */
export async function probeAssistant(preferred = DEFAULT_MODEL): Promise<AssistantStatus> {
  try {
    const res = await fetch(`${HOST}/api/tags`, { method: 'GET' })
    if (!res.ok) return { available: false, models: [], model: null, error: `Ollama returned ${res.status}` }

    const data = await res.json() as { models?: { name: string }[] }
    const models = (data.models ?? []).map(m => m.name)
    if (models.length === 0) {
      return { available: false, models, model: null, error: 'Ollama is running but has no models installed' }
    }

    // exact match, then same family, then whatever is there
    const exact = models.find(m => m === preferred || m.startsWith(`${preferred}:`))
    const family = models.find(m => m.startsWith(preferred.split(':')[0]))
    return { available: true, models, model: exact ?? family ?? models[0] }
  } catch (error) {
    return {
      available: false,
      models: [],
      model: null,
      error: error instanceof Error ? error.message : 'Could not reach Ollama',
    }
  }
}

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
  lines.push(`Rooms: ${inst.rooms.length}. Staff: ${inst.staff.length}. Courses: ${inst.courses.length}.`)
  lines.push(`Teaching days: ${grid.days.map(d => DAY_NAMES[d]).join(', ')}`)
  lines.push(`Slots per day: ${grid.slots} starting ${grid.labels.join(', ')}`)
  lines.push('')

  if (!report) {
    lines.push('SCHEDULE: none has been generated yet.')
    return lines.join('\n')
  }

  lines.push('SCHEDULE')
  lines.push(`${report.placed} of ${report.requested} required meetings placed in ${report.elapsedMs} ms.`)
  lines.push(`Unplaced groups: ${report.unplaced.length}.`)
  if (report.unplaced.length > 0) {
    for (const u of report.unplaced.slice(0, 8)) {
      lines.push(`  - ${u.courseLabel} for ${u.cohortLabel}: ${u.missing} missing. Reason: ${u.reason}`)
    }
  }
  lines.push('')

  lines.push('CONSTRAINTS THAT REFUSED THE MOST PLACEMENTS')
  for (const b of report.bottlenecks.slice(0, 6)) {
    lines.push(`  ${b.code} refused ${b.blocked} candidates — ${b.label}`)
  }
  lines.push('')

  if (input.disabled.length > 0) {
    lines.push(`SWITCHED OFF (${input.disabled.length}): ${input.disabled.slice(0, 12).map(c => c.id).join(', ')}`)
    lines.push('')
  }

  const loads = inst.staff
    .map(f => ({ name: f.name, rank: f.rank, hours: input.staffLoad.get(f.id) ?? 0, cap: f.maxPerWeek }))
    .sort((a, b) => b.hours - a.hours)
  lines.push('BUSIEST STAFF')
  for (const l of loads.slice(0, 8)) lines.push(`  ${l.name} (${l.rank}): ${l.hours} of ${l.cap} hours`)
  lines.push('')

  lines.push('COHORT TIMETABLES')
  for (const cohort of inst.cohorts) {
    const mine = report.sessions.filter(s => s.cohortId === cohort.id)
    if (mine.length === 0) continue
    const byDay = grid.days.map(day => {
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
    }).filter(Boolean)
    lines.push(`  ${cohort.name} — ${mine.length} sessions, ${cohort.size} students`)
    lines.push(...(byDay as string[]))
  }

  return lines.join('\n')
}

const SYSTEM = `You are the assistant inside Aula, a university timetable planner.

Answer ONLY from the BRIEFING below. It is the complete truth about this schedule.
If the briefing does not contain the answer, say so plainly and suggest what the
user could look at instead. Never invent a number, a name, a room or a time.

Style: British English, plain and factual, no marketing language. Two to six
sentences unless a list is genuinely clearer. Quote codes and figures exactly as
they appear in the briefing.`

export interface AskOptions {
  model: string
  briefing: string
  question: string
  history: { role: 'user' | 'assistant'; content: string }[]
  signal?: AbortSignal
  onToken?: (chunk: string) => void
}

/** Ask the local model, streaming tokens back through `onToken`. */
export async function askAssistant(opts: AskOptions): Promise<string> {
  const messages = [
    { role: 'system', content: `${SYSTEM}\n\n--- BRIEFING START ---\n${opts.briefing}\n--- BRIEFING END ---` },
    ...opts.history.slice(-6),
    { role: 'user', content: opts.question },
  ]

  const res = await fetch(`${HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      messages,
      stream: true,
      think: false,
      options: { temperature: 0.2, num_ctx: 8192 },
    }),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) throw new Error(`Assistant request failed (${res.status})`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let answer = ''
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Ollama streams newline-delimited JSON objects
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const chunk = JSON.parse(trimmed) as { message?: { content?: string }; done?: boolean }
        const piece = chunk.message?.content
        if (piece) {
          answer += piece
          opts.onToken?.(piece)
        }
      } catch {
        // a partial line: it will complete on the next read
      }
    }
  }

  return answer.trim()
}
