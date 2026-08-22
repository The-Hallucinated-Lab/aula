import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store'
import { Callout, Hero, Pill } from '../components/ui'
import { CATALOGUE } from '../data/constraints/catalogue'
import { isImplemented } from '../engine/rules'
import { DAY_NAMES } from '../data/model'
import { buildBriefing, DEFAULT_MODEL } from '../engine/assistant'
import { bridge } from '../platform'

interface Msg {
  id: number
  from: 'user' | 'aula'
  text: string
  tag?: string
  streaming?: boolean
}

const SUGGESTIONS = [
  'Why is CSE 1A busy on Monday?',
  'What blocked the most placements?',
  'Who is carrying the heaviest load?',
  'What is constraint 184?',
  'Where is the schedule tightest?',
  'Which rooms are barely used?',
]

let msgId = 1
let requestSeq = 1

type Mode = 'checking' | 'local' | 'offline'

export function Assistant() {
  const store = useApp()
  const [mode, setMode] = useState<Mode>('checking')
  const [model, setModel] = useState<string | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const activeRequest = useRef<number | null>(null)

  const [messages, setMessages] = useState<Msg[]>([{
    id: msgId++,
    from: 'aula',
    tag: 'Ready',
    text: 'Ask about this week. I answer from the solved schedule — the cohorts, rooms, staff and the constraints that shaped it.',
  }])

  /* --- is a local model available? --- */
  useEffect(() => {
    let cancelled = false
    const api = bridge()

    const probe = async () => {
      if (!api) {
        // Browser build: Ollama would reject the origin, so do not pretend.
        if (!cancelled) { setMode('offline'); setProbeError('The local model is only available in the desktop app.') }
        return
      }
      try {
        const res = await api.assistant.probe()
        if (cancelled) return
        if (!res.ok || res.models.length === 0) {
          setMode('offline')
          setProbeError(res.error ?? 'Ollama is running but has no models installed.')
          return
        }
        const exact = res.models.find(m => m === DEFAULT_MODEL || m.startsWith(`${DEFAULT_MODEL}:`))
        const family = res.models.find(m => m.startsWith(DEFAULT_MODEL.split(':')[0]))
        setModel(exact ?? family ?? res.models[0])
        setMode('local')
      } catch (error) {
        if (cancelled) return
        setMode('offline')
        setProbeError(error instanceof Error ? error.message : 'Could not reach Ollama.')
      }
    }
    void probe()
    return () => { cancelled = true }
  }, [])

  const briefing = useMemo(() => buildBriefing({
    institution: store.institution,
    report: store.report,
    disabled: CATALOGUE.filter(c => store.states[c.id]?.enabled === false),
    facultyLoad: store.metrics.facultyLoad,
  }), [store.institution, store.report, store.states, store.metrics])

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    setDraft('')

    const userMsg: Msg = { id: msgId++, from: 'user', text: q }
    setMessages(m => [...m, userMsg])
    scrollDown()

    const api = bridge()
    if (mode !== 'local' || !model || !api) {
      const answer = explain(q, store)
      setMessages(m => [...m, { id: msgId++, from: 'aula', text: answer.text, tag: answer.tag }])
      scrollDown()
      return
    }

    const replyId = msgId++
    setMessages(m => [...m, { id: replyId, from: 'aula', text: '', tag: model, streaming: true }])
    setBusy(true)

    const requestId = requestSeq++
    activeRequest.current = requestId

    const history = messages
      .filter(m => !m.streaming)
      .slice(-6)
      .map(m => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text }))

    try {
      await api.assistant.chat(
        {
          requestId,
          model,
          messages: [
            { role: 'system', content: systemPrompt(briefing) },
            ...history,
            { role: 'user', content: q },
          ],
        },
        chunk => {
          setMessages(m => m.map(x => (x.id === replyId ? { ...x, text: x.text + chunk } : x)))
          scrollDown()
        },
      )
      setMessages(m => m.map(x => (x.id === replyId ? { ...x, streaming: false } : x)))
    } catch (error) {
      // A model failure must not cost the user their answer.
      const fallback = explain(q, store)
      setMessages(m => m.map(x => x.id === replyId
        ? {
          ...x,
          streaming: false,
          tag: 'Local model unavailable — answered from the schedule directly',
          text: `${fallback.text}\n\n(${error instanceof Error ? error.message : 'the model stopped responding'})`,
        }
        : x))
    } finally {
      setBusy(false)
      activeRequest.current = null
      scrollDown()
    }
  }

  const stop = () => {
    const api = bridge()
    if (api && activeRequest.current !== null) api.assistant.cancel(activeRequest.current)
  }

  return (
    <div className="fade-in">
      <Hero
        eyebrow="Assistant"
        title={<>Ask the schedule <strong>why</strong></>}
        desc="Backed by a language model running on this machine. It is given the solved schedule as its only source and told to answer from that alone — nothing is sent anywhere."
        side={
          <div className="row" style={{ gap: 8 }}>
            {mode === 'checking' && <Pill>Checking for a local model…</Pill>}
            {mode === 'local' && <Pill tone="ok">{model} · local</Pill>}
            {mode === 'offline' && <Pill tone="warn">Schedule explainer</Pill>}
          </div>
        }
      />

      <main className="page">
        {mode === 'offline' && (
          <Callout tone="info" title="Answering directly from the schedule">
            {probeError} Answers still come from the solved timetable — they are read out of
            the data rather than written by a model. To enable the language model, install{' '}
            <b>Ollama</b>, run <span className="mono">ollama pull {DEFAULT_MODEL}</span>, and reopen this page.
          </Callout>
        )}

        <div className="card chat">
          <div className="chat-scroll" ref={scroller}>
            {messages.map(m => (
              <div key={m.id} className={`msg ${m.from === 'user' ? 'msg-user' : 'msg-ai'}`}>
                {m.tag && <span className="msg-tag">{m.tag}</span>}
                {m.text}
                {m.streaming && m.text === '' && (
                  <span className="typing"><span /><span /><span /></span>
                )}
              </div>
            ))}
          </div>

          <div className="suggest">
            {SUGGESTIONS.map(s => (
              <button key={s} disabled={busy} onClick={() => void send(s)}>{s}</button>
            ))}
          </div>

          <div className="chat-input">
            <input
              value={draft}
              disabled={busy}
              placeholder={busy ? 'Thinking…' : 'Ask about a cohort, a constraint number, a room or a person…'}
              aria-label="Ask the assistant"
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void send(draft) }}
            />
            {busy
              ? <button className="btn btn-soft" onClick={stop}>Stop</button>
              : <button className="btn btn-primary" onClick={() => void send(draft)}>Ask</button>}
          </div>
        </div>
      </main>
    </div>
  )
}

function systemPrompt(briefing: string): string {
  return `You are the assistant inside Aula, a university timetable planner.

Answer ONLY from the BRIEFING below. It is the complete truth about this schedule.
If the briefing does not contain the answer, say so plainly and suggest what the user
could look at instead. Never invent a number, a name, a room or a time.

Style: British English, plain and factual, no marketing language. Two to six sentences
unless a list is genuinely clearer. Quote codes and figures exactly as they appear.

--- BRIEFING START ---
${briefing}
--- BRIEFING END ---`
}

/* ------------------------------------------------------------------ *
 * Deterministic explainer — the fallback, and the safety net when the
 * model errors mid-answer. It reads the report; it never guesses.
 * ------------------------------------------------------------------ */

type Store = ReturnType<typeof useApp.getState>

function explain(q: string, s: Store): { text: string; tag?: string } {
  const lower = q.toLowerCase()

  if (!s.report) {
    return { tag: 'No solve yet', text: 'There is no solved timetable in memory. Run Setup and generate one, then ask me again.' }
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
    const lines = top.map(b => `${b.code} refused ${b.blocked.toLocaleString()} candidate placements — “${b.label}”`)
    const missing = s.report.unplaced.reduce((a, u) => a + u.missing, 0)
    return {
      tag: 'Bottlenecks',
      text: `The rules that refused the most placements were:\n\n${lines.join('\n')}\n\nResource-exclusivity rules always sit near the top; that is normal. It matters only when sessions went unplaced — ${missing === 0 ? 'none did' : `${missing} did`}.`,
    }
  }

  if (/load|busiest|heaviest|overwork|workload/.test(lower)) {
    const ranked = s.institution.faculty
      .map(f => ({ f, h: s.metrics.facultyLoad.get(f.id) ?? 0 }))
      .sort((a, b) => b.h - a.h)
      .slice(0, 4)
    return {
      tag: 'Workload',
      text: `Heaviest teaching loads this week:\n\n${ranked.map(r => `${r.f.name} (${r.f.rank}) — ${r.h} h of a ${r.f.maxPerWeek} h cap`).join('\n')}\n\nSpread across all staff is ±${s.metrics.loadStdDev.toFixed(1)} hours.`,
    }
  }

  if (/room/.test(lower) && /unused|barely|idle|empty|least/.test(lower)) {
    const ranked = [...s.metrics.roomUsage].sort((a, b) => a.used - b.used).slice(0, 5)
    const lines = ranked.map(r => {
      const room = s.institution.rooms.find(x => x.id === r.roomId)
      return `${room?.name ?? r.roomId} (${room?.kind ?? '?'}, ${room?.capacity ?? '?'} seats) — ${r.used} h`
    })
    return { tag: 'Room usage', text: `Least-used rooms this week:\n\n${lines.join('\n')}` }
  }

  if (/tight|pressure|utilis|utiliz|capacity|full/.test(lower)) {
    let bestDay = 0, bestSlot = 0, best = -1
    s.metrics.heatmap.forEach((row, di) => row.forEach((v, si) => {
      if (v > best) { best = v; bestDay = di; bestSlot = si }
    }))
    const day = s.institution.grid.days[bestDay]
    return {
      tag: 'Pressure',
      text: `Room utilisation is ${(s.metrics.utilization * 100).toFixed(1)}% across the week. The busiest moment is ${DAY_NAMES[day]} at ${s.institution.grid.labels[bestSlot]}, with ${best} of ${s.institution.rooms.length} rooms in use.`,
    }
  }

  const cohort = s.institution.cohorts.find(c => lower.includes(c.name.toLowerCase()))
  if (cohort) {
    const mine = s.sessions.filter(x => x.cohortId === cohort.id)
    const dayMatch = DAY_NAMES.findIndex(d => lower.includes(d.toLowerCase()))
    if (dayMatch >= 0) {
      const onDay = mine.filter(x => x.day === dayMatch).sort((a, b) => a.slot - b.slot)
      if (onDay.length === 0) return { tag: cohort.name, text: `${cohort.name} has nothing scheduled on ${DAY_NAMES[dayMatch]}.` }
      const lines = onDay.map(x => {
        const c = s.institution.courses.find(y => y.id === x.courseId)
        const r = s.institution.rooms.find(y => y.id === x.roomId)
        const f = s.institution.faculty.find(y => y.id === x.facultyId)
        return `${s.institution.grid.labels[x.slot]} — ${c?.code} ${c?.name} · ${r?.name ?? 'no room'} · ${f?.name}`
      })
      return { tag: cohort.name, text: `${DAY_NAMES[dayMatch]} for ${cohort.name}:\n\n${lines.join('\n')}` }
    }
    const hours = mine.reduce((a, x) => a + x.length, 0)
    return {
      tag: cohort.name,
      text: `${cohort.name} has ${mine.length} sessions totalling ${hours} contact hours this week, across ${new Set(mine.map(x => x.day)).size} days. ${cohort.size} students.`,
    }
  }

  if (/unplaced|missing|fail|could not|couldn't/.test(lower)) {
    if (s.report.unplaced.length === 0) {
      return { tag: 'Placement', text: `Everything fits — all ${s.report.requested} required meetings were placed.` }
    }
    const lines = s.report.unplaced.slice(0, 5).map(u =>
      `${u.courseLabel} for ${u.cohortLabel} — ${u.missing} missing. ${u.reason}`)
    return { tag: 'Unplaced', text: `${s.report.unplaced.length} groups did not fully place:\n\n${lines.join('\n')}` }
  }

  return {
    tag: 'Try asking',
    text: `I answer from the solved schedule, so I need something concrete. Try a cohort name (${s.institution.cohorts.slice(0, 3).map(c => c.name).join(', ')}), a constraint number (1–500), or ask what blocked the most placements, who is busiest, or where the week is tightest.`,
  }
}
