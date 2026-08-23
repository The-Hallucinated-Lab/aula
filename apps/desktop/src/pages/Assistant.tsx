import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store'
import { Callout, Hero, Pill } from '../components/ui'
import { CATALOGUE } from '@aula/core/data/constraints/catalogue'
import { buildBriefing, DEFAULT_MODEL, systemPrompt } from '@aula/core/engine/assistant'
import { explainSchedule } from '@aula/core/engine/explain'
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

  const [messages, setMessages] = useState<Msg[]>([
    {
      id: msgId++,
      from: 'aula',
      tag: 'Ready',
      text: 'Ask about this week. I answer from the solved schedule — the sections, rooms, staff and the constraints that shaped it.',
    },
  ])

  /* --- is a local model available? --- */
  useEffect(() => {
    let cancelled = false
    const api = bridge()

    const probe = async () => {
      if (!api) {
        // Browser build: Ollama would reject the origin, so do not pretend.
        if (!cancelled) {
          setMode('offline')
          setProbeError('The local model is only available in the desktop app.')
        }
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
        // Exact tag, then any build of the same family, then whatever is there.
        const family = DEFAULT_MODEL.split(':')[0] ?? DEFAULT_MODEL
        const exact = res.models.find(m => m === DEFAULT_MODEL || m.startsWith(`${DEFAULT_MODEL}:`))
        const sameFamily = res.models.find(m => m.startsWith(family))
        const chosen = exact ?? sameFamily ?? res.models[0]
        if (chosen === undefined) {
          setMode('offline')
          setProbeError('Ollama is running but has no models installed.')
          return
        }
        setModel(chosen)
        setMode('local')
      } catch (error) {
        if (cancelled) return
        setMode('offline')
        setProbeError(error instanceof Error ? error.message : 'Could not reach Ollama.')
      }
    }
    void probe()
    return () => {
      cancelled = true
    }
  }, [])

  const briefing = useMemo(
    () =>
      buildBriefing({
        institution: store.institution,
        report: store.report,
        disabled: CATALOGUE.filter(c => store.states[c.id]?.enabled === false),
        staffLoad: store.metrics.staffLoad,
      }),
    [store.institution, store.report, store.states, store.metrics],
  )

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
      const answer = explainSchedule(q, store)
      setMessages(m => [
        ...m,
        {
          id: msgId++,
          from: 'aula',
          text: answer.text,
          ...(answer.tag ? { tag: answer.tag } : {}),
        },
      ])
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
      const fallback = explainSchedule(q, store)
      setMessages(m =>
        m.map(x =>
          x.id === replyId
            ? {
                ...x,
                streaming: false,
                tag: 'Local model unavailable — answered from the schedule directly',
                text: `${fallback.text}\n\n(${error instanceof Error ? error.message : 'the model stopped responding'})`,
              }
            : x,
        ),
      )
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
        title={
          <>
            Ask the schedule <strong>why</strong>
          </>
        }
        desc="Backed by a language model running on this machine. It is given the solved schedule as its only source and told to answer from that alone — nothing is sent anywhere."
        side={
          <div className="row" style={{ gap: 8 }}>
            {mode === 'checking' && <Pill>Checking for a local model…</Pill>}
            {mode === 'local' && <Pill tone="ok">{model} · local</Pill>}
            {mode === 'offline' && <Pill tone="warn">Schedule explainer</Pill>}
          </div>
        }
      />

      <div className="page">
        {mode === 'offline' && (
          <Callout tone="info" title="Answering directly from the schedule">
            {probeError} Answers still come from the solved timetable — they are read out of the
            data rather than written by a model. To enable the language model, install <b>Ollama</b>
            , run <span className="mono">ollama pull {DEFAULT_MODEL}</span>, and reopen this page.
          </Callout>
        )}

        <div className="card chat">
          <div className="chat-scroll" ref={scroller}>
            {messages.map(m => (
              <div key={m.id} className={`msg ${m.from === 'user' ? 'msg-user' : 'msg-ai'}`}>
                {m.tag && <span className="msg-tag">{m.tag}</span>}
                {m.text}
                {m.streaming && m.text === '' && (
                  <span className="typing">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="suggest">
            {SUGGESTIONS.map(s => (
              <button key={s} disabled={busy} onClick={() => void send(s)}>
                {s}
              </button>
            ))}
          </div>

          <div className="chat-input">
            <input
              value={draft}
              disabled={busy}
              placeholder={
                busy ? 'Thinking…' : 'Ask about a section, a constraint number, a room or a person…'
              }
              aria-label="Ask the assistant"
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void send(draft)
              }}
            />
            {busy ? (
              <button className="btn btn-soft" onClick={stop}>
                Stop
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => void send(draft)}>
                Ask
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
