import { useEffect, useMemo, useState } from 'react'
import { useApp, type SubstituteProposal } from '../store'
import { Combobox, Empty, Hero, SERIES } from '../components/ui'
import {
  DAY_NAMES, DAY_SHORT,
  type AcademicCalendar, type Institution, type Session,
} from '../data/model'
import { useToast } from '../components/Toast'
import { useNavigate } from 'react-router-dom'
import { gridCsv } from '../data/exporters'
import { saveText } from '../platform'
import { StaleNotice } from '../components/StaleNotice'
import { Portal } from '../components/Dialog'
import { blackoutsCovering, meetingsInTerm } from '../data/academicCalendar'

type ViewMode = 'cohort' | 'staff' | 'room'

export function Timetable() {
  const {
    institution, sessions, checkMove, moveSession, proposeSubstitutes,
    applySubstitutions, absences, locked, toggleLock, solving,
  } = useApp()
  const toast = useToast()
  const navigate = useNavigate()

  const [view, setView] = useState<ViewMode>('cohort')
  const [entityId, setEntityId] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [hover, setHover] = useState<{ day: number; slot: number; ok: boolean } | null>(null)
  const [proposals, setProposals] = useState<{ staffId: string; day: number; items: SubstituteProposal[] } | null>(null)

  const grid = institution.grid

  const entities = useMemo(() => (
    view === 'cohort' ? institution.cohorts
      : view === 'staff' ? institution.staff.filter(f => !f.onSabbatical)
        : institution.rooms
  ), [view, institution])

  /* Two people can share a name — the coordinator's list has several — so a
     staff option carries the department that tells them apart, and a room
     carries its building. Searching matches the hint too, so "CSE" narrows to
     one department's staff without a separate filter. */
  const entityOptions = useMemo(() => {
    const deptName = new Map(institution.departments.map(d => [d.id, d.code]))
    const buildingName = new Map(institution.buildings.map(b => [b.id, b.name]))
    return entities.map(e => {
      if (view === 'staff') {
        const f = e as (typeof institution.staff)[number]
        return { value: f.id, label: f.name, hint: deptName.get(f.deptId) ?? '' }
      }
      if (view === 'room') {
        const r = e as (typeof institution.rooms)[number]
        return { value: r.id, label: r.name, hint: buildingName.get(r.buildingId) ?? '' }
      }
      const c = e as (typeof institution.cohorts)[number]
      return { value: c.id, label: c.name, hint: `${c.size} students` }
    })
  }, [entities, view, institution])

  // keep the selector valid whenever the institution or view changes
  useEffect(() => {
    if (!entities.some(e => e.id === entityId)) setEntityId(entities[0]?.id ?? '')
  }, [entities, entityId])

  const visible = useMemo(() => sessions.filter(s =>
    view === 'cohort' ? s.cohortId === entityId
      : view === 'staff' ? s.staffId === entityId
        : s.roomId === entityId,
  ), [sessions, view, entityId])

  /** start cell -> session, plus cells a multi-slot block continues through */
  const { starts, covered } = useMemo(() => {
    const starts = new Map<string, Session>()
    const covered = new Set<string>()
    for (const s of visible) {
      starts.set(`${s.day}:${s.slot}`, s)
      for (let k = 1; k < s.length; k++) covered.add(`${s.day}:${s.slot + k}`)
    }
    return { starts, covered }
  }, [visible])

  const selectedSession = sessions.find(s => s.id === selected) ?? null

  const switchView = (v: ViewMode) => {
    setView(v)
    setSelected(null)
    setEntityId('')
  }

  const onDrop = (day: number, slot: number) => {
    if (!dragId) return
    const res = moveSession(dragId, day, slot)
    if (res.ok) {
      const reloc = res.relocatedRoomId
        ? ` · relocated to ${institution.rooms.find(r => r.id === res.relocatedRoomId)?.name}`
        : ''
      toast(`Moved to ${DAY_NAMES[day]} ${grid.labels[slot]}${reloc}`, 'ok')
    } else if (res.rejections[0]) {
      toast(`${res.rejections[0].code} — ${res.rejections[0].message}`, 'danger')
    }
    setDragId(null)
    setHover(null)
  }

  if (sessions.length === 0) {
    return (
      <div className="fade-in">
        <Hero
          eyebrow="Live editor"
          title={<>Nothing scheduled <strong>yet</strong></>}
          desc="Describe your institution, then generate. The grid fills in and every drag is checked against the rules you enabled."
        />
        <main className="page">
          <Empty
            title={solving ? 'Solving…' : 'No timetable in memory'}
            desc={solving
              ? 'The engine is placing sessions on a background thread.'
              : 'Run setup to enter your student, programme, room and staff numbers, then generate a timetable.'}
            action={<button className="btn btn-primary" onClick={() => navigate('/setup')}>Open setup</button>}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <Hero
        eyebrow="Live editor"
        title={<>Drag a class. <strong>Aula checks the rules.</strong></>}
        desc="Green means every enabled hard constraint still holds. Red names the exact rule you would break, by catalogue number. Room clashes self-resolve when a suitable room is free."
        side={
          <div className="row">
            <div className="tabs">
              {(['cohort', 'staff', 'room'] as ViewMode[]).map(v => (
                <button key={v} className={view === v ? 'active' : ''} onClick={() => switchView(v)}>
                  {v === 'cohort' ? 'By section' : v === 'staff' ? 'By staff' : 'By room'}
                </button>
              ))}
            </div>
            <Combobox
              value={entityId}
              ariaLabel="Choose what to view"
              width={280}
              options={entityOptions}
              onChange={v => { setEntityId(v); setSelected(null) }}
            />
            <button
              className="btn btn-soft"
              title="Export this view as a week grid"
              onClick={async () => {
                const label = entities.find(e => e.id === entityId)?.name ?? view
                const res = await saveText({
                  suggestedName: `${label.replace(/[^\w-]+/g, '-').toLowerCase()}-timetable.csv`,
                  data: gridCsv(institution, sessions, view, entityId),
                  filters: [{ name: 'CSV', extensions: ['csv'] }],
                })
                if (res.ok) toast(`Exported ${label}`, 'ok')
                else if (!res.canceled) toast(res.error ?? 'Export failed', 'danger')
              }}
            >
              Export view
            </button>
          </div>
        }
      />

      <main className="page">
        <StaleNotice />
        <div className="grid grid-main-side">
          <div className="card tt-wrap">
            <div
              className="tt"
              style={{ gridTemplateColumns: `64px repeat(${grid.days.length}, minmax(140px, 1fr))` }}
            >
              <span className="tt-corner" />
              {grid.days.map(d => {
                /* A column is not worth the same as its neighbour once the
                   academic calendar is applied: a Thursday carrying four public
                   holidays delivers four fewer meetings than a Tuesday. Saying
                   so in the header is cheaper than letting somebody find out in
                   week fourteen. */
                const dates = institution.calendar.dated
                  ? institution.calendar.impact.find(i => i.day === d)
                  : undefined
                return (
                  <span
                    key={d}
                    className="tt-day"
                    title={dates
                      ? `${DAY_NAMES[d]} — ${dates.teachingDates} teaching dates this term${dates.lostDates > 0 ? `, ${dates.lostDates} lost to ${dates.causes.join(', ')}` : ''}`
                      : DAY_NAMES[d]}
                  >
                    {DAY_SHORT[d]}
                    {dates && (
                      <span className={`tt-day-dates ${dates.lostDates > 0 ? 'thin' : ''}`}>
                        {dates.teachingDates}×
                      </span>
                    )}
                  </span>
                )
              })}

              {Array.from({ length: grid.slots }, (_, slot) => (
                <SlotRow
                  key={slot}
                  slot={slot}
                  days={grid.days}
                  label={grid.labels[slot]}
                  lunch={grid.lunchSlots.includes(slot)}
                  calendar={institution.calendar}
                  starts={starts}
                  covered={covered}
                  institution={institution}
                  draggable={view === 'cohort'}
                  dragId={dragId}
                  hover={hover}
                  selected={selected}
                  locked={locked}
                  onSelect={setSelected}
                  onDragStart={setDragId}
                  onDragEnd={() => { setDragId(null); setHover(null) }}
                  onHoverCell={(day, s) => {
                    if (!dragId) return
                    if (hover && hover.day === day && hover.slot === s) return
                    setHover({ day, slot: s, ok: checkMove(dragId, day, s).ok })
                  }}
                  onDrop={onDrop}
                />
              ))}
            </div>
          </div>

          <DetailPanel
            session={selectedSession}
            onAbsence={(staffId, day) => setProposals({ staffId, day, items: proposeSubstitutes(staffId, day) })}
            visibleCount={visible.length}
            view={view}
            locked={locked}
            onToggleLock={toggleLock}
            absences={absences}
          />
        </div>
      </main>

      {proposals && (
        <SubstituteSheet
          data={proposals}
          institution={institution}
          onClose={() => setProposals(null)}
          onApply={() => {
            applySubstitutions(proposals.staffId, proposals.day, proposals.items)
            const n = proposals.items.filter(p => p.candidateId).length
            toast(`${n} session${n === 1 ? '' : 's'} repaired — rest of the week untouched`, 'ok')
            setProposals(null)
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}

/* ---------- one time-slot row ---------- */

function SlotRow(props: {
  slot: number
  days: number[]
  label: string
  lunch: boolean
  calendar: AcademicCalendar
  starts: Map<string, Session>
  covered: Set<string>
  institution: Institution
  draggable: boolean
  dragId: string | null
  hover: { day: number; slot: number; ok: boolean } | null
  selected: string | null
  locked: Set<string>
  onSelect: (id: string | null) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onHoverCell: (day: number, slot: number) => void
  onDrop: (day: number, slot: number) => void
}) {
  const { slot, starts, covered, institution, hover } = props
  return (
    <>
      {props.lunch && <div className="tt-lunch">Protected break · {props.label}</div>}
      <span className="tt-time">{props.label}</span>
      {props.days.map(day => {
        const key = `${day}:${slot}`
        const s = starts.get(key)
        const isCovered = covered.has(key)
        const isHover = hover && hover.day === day && hover.slot === slot
        // a repeating institution event holds this cell in every week of the term
        const held = blackoutsCovering(props.calendar, day, slot, 1)[0]
        return (
          <div
            key={day}
            className={`tt-cell ${isHover ? (hover.ok ? 'drop-ok' : 'drop-bad') : ''} ${isCovered ? 'tt-cell-cont' : ''} ${held && !s ? 'tt-cell-held' : ''}`}
            title={held ? `${held.name}${held.coreOnly ? ' — mandatory classes only' : ''}` : undefined}
            onDragOver={e => { e.preventDefault(); props.onHoverCell(day, slot) }}
            onDrop={e => { e.preventDefault(); props.onDrop(day, slot) }}
          >
            {held && !s && <span className="tt-held-mark">{held.name}</span>}
            {s && (
              <Lesson
                session={s}
                institution={institution}
                draggable={props.draggable && !props.locked.has(s.id)}
                dragging={props.dragId === s.id}
                selected={props.selected === s.id}
                pinned={props.locked.has(s.id)}
                onSelect={() => props.onSelect(props.selected === s.id ? null : s.id)}
                onDragStart={() => props.onDragStart(s.id)}
                onDragEnd={props.onDragEnd}
              />
            )}
            {isCovered && <span className="tt-cont-mark" aria-hidden>⋮</span>}
          </div>
        )
      })}
    </>
  )
}

function Lesson(props: {
  session: Session
  institution: Institution
  draggable: boolean
  dragging: boolean
  selected: boolean
  pinned: boolean
  onSelect: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const { session: s, institution } = props
  const course = institution.courses.find(c => c.id === s.courseId)
  const room = institution.rooms.find(r => r.id === s.roomId)
  const dept = institution.departments.find(d => d.id === course?.deptId)
  const color = SERIES[(dept?.colorIndex ?? 0) % SERIES.length]
  if (!course) return null

  return (
    <div
      className={`lesson ${props.dragging ? 'dragging' : ''} ${props.selected ? 'selected' : ''} ${s.substitutedFor ? 'substituted' : ''}`}
      style={{
        borderLeftColor: s.substitutedFor ? undefined : color,
        minHeight: s.length > 1 ? `${s.length * 30}px` : undefined,
      }}
      draggable={props.draggable}
      role="button"
      tabIndex={0}
      onClick={props.onSelect}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onSelect() } }}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; props.onDragStart() }}
      onDragEnd={props.onDragEnd}
      title={`${course.code} · ${course.name}${s.length > 1 ? ` · ${s.length}-slot block` : ''}`}
    >
      <span className="lesson-code">
        {course.code}
        {props.pinned && ' · pinned'}
        {s.substitutedFor ? ' · substituted' : ''}
      </span>
      <span className="lesson-name">{course.name}</span>
      <span className="lesson-meta">
        {room?.name ?? 'no room'} · {course.kind}{s.length > 1 ? ` · ${s.length}h` : ''}
      </span>
    </div>
  )
}

/* ---------- detail panel ---------- */

function DetailPanel(props: {
  session: Session | null
  onAbsence: (staffId: string, day: number) => void
  visibleCount: number
  view: ViewMode
  locked: Set<string>
  onToggleLock: (id: string) => void
  absences: Set<string>
}) {
  const institution = useApp(s => s.institution)
  const s = props.session

  if (!s) {
    return (
      <div className="card card-pad" style={{ position: 'sticky', top: 84 }}>
        <div className="card-title" style={{ marginBottom: 8 }}>Session details</div>
        <p className="small muted" style={{ lineHeight: 1.6 }}>
          Select a class to inspect it — or drag one to a new slot and watch the
          constraint checker respond in real time.
        </p>
        <div className="divider" style={{ margin: '16px 0' }} />
        <div className="stack" style={{ gap: 8 }}>
          <LegendRow color="var(--ok-soft)" ring="var(--ok)" label="Safe to drop — every hard rule holds" />
          <LegendRow color="var(--danger-soft)" ring="var(--danger)" label="Blocked — the rule is named by number" />
          <LegendRow color="var(--warn-soft)" ring="var(--warn)" label="Substituted session" />
        </div>
        <div className="divider" style={{ margin: '16px 0' }} />
        <p className="small muted">
          {props.visibleCount} sessions in this {props.view} view
          {props.view !== 'cohort' && ' · drag is available in section view'}.
        </p>
      </div>
    )
  }

  const course = institution.courses.find(c => c.id === s.courseId)
  const fac = institution.staff.find(f => f.id === s.staffId)
  const room = institution.rooms.find(r => r.id === s.roomId)
  const building = institution.buildings.find(b => b.id === room?.buildingId)
  const cohort = institution.cohorts.find(c => c.id === s.cohortId)
  const original = s.substitutedFor ? institution.staff.find(f => f.id === s.substitutedFor) : null
  const alreadyAbsent = props.absences.has(`${s.staffId}:${s.day}`)
  const pinned = props.locked.has(s.id)
  const grid = institution.grid
  const endLabel = grid.labels[s.slot + s.length] ?? '—'
  const termMeetings = meetingsInTerm(institution.calendar, s.day)
  const lostDates = institution.calendar.impact.find(i => i.day === s.day)?.lostDates ?? 0

  if (!course || !fac || !cohort) return null

  return (
    <div className="card card-pad" style={{ position: 'sticky', top: 84 }}>
      <div className="spread">
        <span className="chip chip-accent mono">{course.code}</span>
        <button
          className={`btn ${pinned ? 'btn-soft' : 'btn-ghost'}`}
          onClick={() => props.onToggleLock(s.id)}
          title="Constraint 422 — a pinned session cannot be moved by the algorithm"
        >
          {pinned ? '◉ Pinned' : '○ Pin'}
        </button>
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', margin: '10px 0 2px' }}>
        {course.name}
      </h3>
      <p className="small muted">
        {DAY_NAMES[s.day]} · {grid.labels[s.slot]}–{endLabel}
      </p>

      <div className="stack" style={{ gap: 8, margin: '16px 0' }}>
        <Row label="Instructor" value={`${fac.name} · ${fac.rank}`} />
        {original && <Row label="Covering for" value={original.name} warn />}
        <Row
          label="Room"
          value={room ? `${room.name} · ${building?.name ?? ''} (seats ${room.capacity})` : 'No room required'}
        />
        <Row label="Section" value={`${cohort.name} · ${cohort.size} students`} />
        <Row label="Structure" value={`${course.credits} credits · ${course.weekly}×/week · ${course.kind}`} />
        {/* The grid says where; only the calendar says how often. */}
        <Row
          label="This term"
          value={institution.calendar.dated
            ? `Meets ${termMeetings} time${termMeetings === 1 ? '' : 's'}${lostDates > 0 ? ` · ${lostDates} lost to closures` : ''}`
            : `${institution.calendar.weeks} weeks · term dates not set`}
          warn={institution.calendar.dated && lostDates > 0}
        />
      </div>

      <button
        className="btn btn-danger-soft"
        style={{ width: '100%', justifyContent: 'center' }}
        disabled={alreadyAbsent}
        onClick={() => props.onAbsence(s.staffId, s.day)}
      >
        {alreadyAbsent
          ? `Already marked absent ${DAY_SHORT[s.day]}`
          : `Mark ${fac.name.split(' ').slice(0, 2).join(' ')} absent on ${DAY_NAMES[s.day]}`}
      </button>
      <p className="small muted" style={{ marginTop: 10, lineHeight: 1.55 }}>
        Aula repairs locally — qualified, free substitutes for that day only.
        The rest of the week stays exactly as it is.
      </p>
    </div>
  )
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="panel spread" style={warn ? { background: 'var(--warn-soft)' } : undefined}>
      <span className="small muted">{label}</span>
      <span className="small" style={{ fontWeight: 700, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function LegendRow({ color, ring, label }: { color: string; ring: string; label: string }) {
  return (
    <div className="row">
      <span style={{
        width: 14, height: 14, borderRadius: 4, background: color,
        border: `1.5px dashed ${ring}`, flexShrink: 0,
      }} />
      <span className="small muted">{label}</span>
    </div>
  )
}

/* ---------- substitution sheet ---------- */

function SubstituteSheet(props: {
  data: { staffId: string; day: number; items: SubstituteProposal[] }
  institution: Institution
  onClose: () => void
  onApply: () => void
}) {
  const { data, institution } = props
  const absent = institution.staff.find(f => f.id === data.staffId)
  const covered = data.items.filter(i => i.candidateId).length
  if (!absent) return null

  /* Portalled for the same reason the staff and calendar dialogs are: the page
     wrapper carries a transform, which turns it into the containing block for
     `position: fixed` and drops the overlay wherever the page happens to be
     scrolled to rather than over the viewport. */
  return (
    <Portal>
    <div className="overlay" onClick={props.onClose} role="dialog" aria-modal="true" aria-label="Substitution proposals">
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="card-pad" style={{ paddingBottom: 12 }}>
          <div className="hero-eyebrow">Local repair</div>
          <h3 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {absent.name} — absent {DAY_NAMES[data.day]}
          </h3>
          <p className="small muted" style={{ marginTop: 6 }}>
            {data.items.length} session{data.items.length === 1 ? '' : 's'} affected. Candidates must be
            qualified for the subject, free in the slot and under both daily and weekly caps
            (constraints 11–16). Same department and lighter load are preferred.
          </p>
        </div>

        <div className="stack" style={{ gap: 10, padding: '4px 24px 20px', maxHeight: '52vh', overflowY: 'auto' }}>
          {data.items.map(p => (
            <div key={p.sessionId} className="panel spread" style={{ alignItems: 'flex-start' }}>
              <div>
                <div className="mono small" style={{ fontWeight: 600, color: 'var(--ink-3)' }}>{p.slotLabel}</div>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 2 }}>
                  {p.candidateId ? p.candidateName : '— no qualified substitute is free'}
                </div>
              </div>
              <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                {p.candidateId
                  ? <>
                    {p.sameDept && <span className="chip chip-ok">same dept</span>}
                    <span className="chip chip-soft tnum">{p.load} h/wk</span>
                  </>
                  : <span className="chip chip-danger">uncovered</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="spread" style={{ padding: '0 24px 22px' }}>
          <button className="btn btn-ghost" onClick={props.onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={covered === 0} onClick={props.onApply}>
            Apply {covered} substitution{covered === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}
