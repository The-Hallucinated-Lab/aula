import { useMemo, useState } from 'react'
import { useApp } from '../store'
import {
  Callout,
  Combobox,
  Field,
  Hero,
  Meter,
  NumberInput,
  Section,
  Segmented,
  Switch,
  TextInput,
  SERIES,
} from '../components/ui'
import { useToast } from '../components/Toast'
import { ImportPanel } from '../components/ImportPanel'
import {
  DAY_NAMES,
  DAY_SHORT,
  COURSE_KINDS,
  SELECTABLE_ROOM_KINDS,
  type CourseKind,
  type RoomKind,
} from '@aula/core/data/model'
import {
  FEATURE_PRESETS,
  ROOM_SPECIALISATIONS,
  blankStaff,
  courseRecordsFrom,
  staffRecordsFrom,
  roomRecordsFrom,
  specialisationById,
  type CourseRecord,
  type StaffRecord,
  type RoomRecord,
} from '@aula/core/data/records'
import { HELP } from '../content/help'
import { StaleNotice } from '../components/StaleNotice'
import { StaffDialog } from '../components/StaffDialog'

type Tab = 'staff' | 'rooms' | 'courses' | 'cohorts'

/* The entity is a cohort throughout the code; institutions call it a section.
   Renaming the type would touch the engine for no gain, so the local word is
   applied at the surface. */
const TAB_LABELS: Record<Tab, string> = {
  staff: 'Staff',
  rooms: 'Rooms',
  courses: 'Courses',
  cohorts: 'Sections',
}

export function DataStudio() {
  const [tab, setTab] = useState<Tab>('staff')

  return (
    <div className="fade-in">
      <Hero
        eyebrow="Institution data"
        title={
          <>
            Every entity the engine <strong>schedules around</strong>
          </>
        }
        desc="Everything here is editable. The wizard's numbers create a starting institution; the moment you change a person, a room or a course, your records take over and the generator stops inventing that kind of thing."
        side={
          <div className="tabs">
            {(['staff', 'rooms', 'courses', 'cohorts'] as Tab[]).map(t => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        }
      />

      <main className="page">
        <StaleNotice />
        {tab === 'staff' && <StaffTab />}
        {tab === 'rooms' && <RoomsTab />}
        {tab === 'courses' && <CoursesTab />}
        {tab === 'cohorts' && <CohortsTab />}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Shared: a banner explaining which entities are user-owned
 * ------------------------------------------------------------------ */

function OwnershipBar({ kind, owned }: { kind: 'staff' | 'courses' | 'rooms'; owned: boolean }) {
  const resetEntity = useApp(s => s.resetEntity)
  const toast = useToast()
  const [importing, setImporting] = useState(false)
  const label = kind === 'staff' ? 'staff' : kind === 'courses' ? 'courses' : 'rooms'

  return (
    <div className="panel spread" style={{ marginBottom: 16, padding: '11px 16px' }}>
      <span className="small muted">
        {owned
          ? `These ${label} are yours — edits are saved with the project and the generator no longer touches them.`
          : `These ${label} are generated from your Setup figures. Editing any of them makes the whole list yours to keep.`}
      </span>
      <span className="row" style={{ gap: 8 }}>
        <button className="btn btn-ghost" onClick={() => setImporting(true)}>
          Import from CSV
        </button>
        {owned && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              resetEntity(kind)
              toast(`Reset ${label} to the generated values`)
            }}
          >
            Reset to generated
          </button>
        )}
      </span>
      {importing && <ImportPanel kind={kind} onClose={() => setImporting(false)} />}
    </div>
  )
}

/* ================================================================== *
 * Staff
 * ================================================================== */

function StaffTab() {
  const { institution, metrics, config, editStaff, addStaff, removeStaff } = useApp()
  const toast = useToast()
  const [filter, setFilter] = useState('')
  /* One dialog drives both paths. A new person is a blank record that does not
     exist until Save, so cancelling leaves nothing behind — which is the whole
     point of collecting the details up front rather than dropping a placeholder
     into the roster and hoping somebody comes back to it. */
  const [editing, setEditing] = useState<{ rec: StaffRecord; mode: 'add' | 'edit' } | null>(null)

  const owned = Boolean(config.overrides?.staff)
  const records = useMemo(
    () => config.overrides?.staff ?? staffRecordsFrom(institution),
    [config.overrides?.staff, institution],
  )

  const courseCode = useMemo(
    () => new Map(institution.courses.map(c => [c.id, c.code])),
    [institution.courses],
  )

  const q = filter.trim().toLowerCase()
  const visible = q
    ? records.filter(
        r =>
          r.name.toLowerCase().includes(q) ||
          r.dept.toLowerCase().includes(q) ||
          r.staffCode.toLowerCase().includes(q) ||
          r.courseIds.some(id => (courseCode.get(id) ?? '').toLowerCase().includes(q)),
      )
    : records

  return (
    <>
      <OwnershipBar kind="staff" owned={owned} />

      <div className="filter-bar">
        <div className="search">
          <span aria-hidden>⌕</span>
          <input
            className="input"
            type="search"
            placeholder="Find a staff member, staff ID, department or course code…"
            aria-label="Find staff"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <span className="small muted tnum" style={{ marginLeft: 'auto' }}>
          {visible.length} staff
        </span>
      </div>

      {institution.departments.map(dept => {
        const rows = visible.filter(r => r.dept === dept.code)
        const color = SERIES[dept.colorIndex % SERIES.length] ?? ''
        if (rows.length === 0 && q) return null

        return (
          <Section
            key={dept.id}
            title={`${dept.code} — ${dept.name}`}
            hint={`${rows.length} staff`}
            side={
              <button
                className="btn btn-soft"
                onClick={() => setEditing({ rec: blankStaff(dept.code), mode: 'add' })}
              >
                + Add staff
              </button>
            }
          >
            <div className="card" style={{ overflow: 'hidden' }}>
              {rows.length === 0 && (
                <div className="card-pad small muted">No staff in this department yet.</div>
              )}
              {rows.map((rec, idx) => (
                <div key={rec.id}>
                  {idx > 0 && <div className="divider" style={{ margin: 0 }} />}
                  <StaffRow
                    rec={rec}
                    color={color}
                    load={metrics.staffLoad.get(rec.id) ?? 0}
                    onEdit={() => setEditing({ rec, mode: 'edit' })}
                    onRemove={() => {
                      removeStaff(rec.id)
                      toast(`Removed ${rec.name}`)
                    }}
                  />
                </div>
              ))}
            </div>
          </Section>
        )
      })}

      {editing && (
        <StaffDialog
          initial={editing.rec}
          mode={editing.mode}
          onClose={() => setEditing(null)}
          onSave={saved => {
            if (editing.mode === 'add') {
              addStaff(saved)
              toast(`Added ${saved.name} to ${saved.dept}`, 'ok')
            } else {
              editStaff(saved)
              toast(`Updated ${saved.name}`, 'ok')
            }
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

/** One roster line: enough to recognise a person, nothing that needs a form. */
function StaffRow(props: {
  rec: StaffRecord
  color: string
  load: number
  onEdit: () => void
  onRemove: () => void
}) {
  const { rec } = props

  const notes: string[] = [rec.rank]
  if (rec.employment !== 'Full-time') notes.push(rec.employment.toLowerCase())
  const taught = rec.courseIds.length + rec.secondaryCourseIds.length
  notes.push(`${taught} course${taught === 1 ? '' : 's'}`)
  if (rec.onSabbatical) notes.push('on sabbatical')
  if (rec.unavailableDays.length > 0) {
    notes.push(`off ${rec.unavailableDays.map(d => DAY_SHORT[d]).join('/')}`)
  }
  if (rec.availableDays.length > 0) {
    notes.push(`on campus ${rec.availableDays.map(d => DAY_SHORT[d]).join('/')}`)
  }
  if (rec.blockedSlots.length > 0) {
    notes.push(
      `${rec.blockedSlots.length} blocked period${rec.blockedSlots.length === 1 ? '' : 's'}`,
    )
  }
  if (rec.maxAudience > 0) notes.push(`groups ≤ ${rec.maxAudience}`)
  if (rec.preferredShift !== 'any') notes.push(`prefers ${rec.preferredShift}s`)

  return (
    <div className="record-row">
      <button className="record-toggle" onClick={props.onEdit}>
        <span className="dot" style={{ background: props.color }} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="record-name">
            {rec.name || 'Unnamed staff member'}
            {rec.staffCode && (
              <span className="mono small muted" style={{ marginLeft: 8 }}>
                {rec.staffCode}
              </span>
            )}
          </span>
          <span className="record-sub">{notes.join(' · ')}</span>
        </span>
        <span className="mono tnum small muted">
          {props.load}/{rec.maxPerWeek} h
        </span>
      </button>
      <button
        className="btn btn-danger-soft"
        style={{ alignSelf: 'center', marginRight: 16 }}
        title={`Remove ${rec.name}`}
        onClick={props.onRemove}
      >
        Remove
      </button>
    </div>
  )
}

/* ================================================================== *
 * Rooms
 * ================================================================== */

/** The most specific facility a room's capabilities already satisfy. */
function facilityLabel(rec: RoomRecord): string | undefined {
  const owned = new Set(rec.features)
  return [...ROOM_SPECIALISATIONS]
    .filter(
      sp => sp.kind === rec.kind && sp.features.length > 0 && sp.features.every(f => owned.has(f)),
    )
    .toSorted((a, b) => b.features.length - a.features.length)[0]?.label
}

function RoomsTab() {
  const { institution, metrics, config, editRoom, addRoom, removeRoom } = useApp()
  const toast = useToast()
  const [open, setOpen] = useState<string | null>(null)

  const owned = Boolean(config.overrides?.rooms)
  const records = useMemo(
    () => config.overrides?.rooms ?? roomRecordsFrom(institution),
    [config.overrides?.rooms, institution],
  )
  const grid = institution.grid
  const weekSlots = Math.max(1, grid.days.length * grid.slots)

  return (
    <>
      <OwnershipBar kind="rooms" owned={owned} />

      {config.buildings.map(building => {
        const rows = records.filter(r => r.buildingId === building.id)
        const floors = [...new Set(rows.map(r => r.floor))].toSorted((a, b) => a - b)

        return (
          <Section
            key={building.id}
            title={building.name}
            hint={`${rows.length} rooms · ${building.floors} floor${building.floors === 1 ? '' : 's'} · ${building.walkMinutes} min walk · ${building.hasElevator ? 'lift' : 'no lift'}`}
            side={
              <button
                className="btn btn-soft"
                onClick={() => {
                  addRoom(building.id)
                  toast('Room added')
                }}
              >
                + Add room
              </button>
            }
          >
            {rows.length === 0 && (
              <div className="card card-pad small muted">No rooms in this building yet.</div>
            )}

            {floors.map(floor => (
              <div key={floor} style={{ marginBottom: 14 }}>
                <div className="field-label" style={{ marginBottom: 8 }}>
                  Floor {floor}
                </div>
                <div className="card" style={{ overflow: 'hidden' }}>
                  {rows
                    .filter(r => r.floor === floor)
                    .map((rec, idx) => {
                      const used = metrics.roomUsage.find(x => x.roomId === rec.id)?.used ?? 0
                      const expanded = open === rec.id
                      return (
                        <div key={rec.id}>
                          {idx > 0 && <div className="divider" style={{ margin: 0 }} />}
                          <div className="record-row">
                            <button
                              className="record-toggle"
                              aria-expanded={expanded}
                              onClick={() => setOpen(expanded ? null : rec.id)}
                            >
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span className="record-name mono">{rec.name}</span>
                                <span className="record-sub">
                                  {facilityLabel(rec) ?? rec.kind} · {rec.capacity} seats
                                  {rec.closedDays.length > 0 &&
                                    ` · closed ${rec.closedDays.map(d => DAY_SHORT[d]).join('/')}`}
                                  {rec.restricted && ' · not bookable'}
                                </span>
                              </span>
                              <span style={{ width: 120 }}>
                                <Meter value={used / weekSlots} />
                              </span>
                              <span
                                className={`domain-caret ${expanded ? 'open' : ''}`}
                                aria-hidden
                              >
                                ›
                              </span>
                            </button>
                          </div>

                          {expanded && (
                            <RoomEditor
                              rec={rec}
                              onChange={editRoom}
                              onRemove={() => {
                                removeRoom(rec.id)
                                setOpen(null)
                                toast(`Removed ${rec.name}`)
                              }}
                            />
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            ))}
          </Section>
        )
      })}
    </>
  )
}

function RoomEditor(props: {
  rec: RoomRecord
  onChange: (r: RoomRecord) => void
  onRemove: () => void
}) {
  const { config, institution } = useApp()
  const { rec } = props
  const set = (p: Partial<RoomRecord>) => props.onChange({ ...rec, ...p })
  const grid = institution.grid
  const building = config.buildings.find(b => b.id === rec.buildingId)

  /* A room carries features, not a facility label. Reading the label back means
     asking which facility this room already satisfies — the most specific one
     wins, so a wet lab with a fume hood shows as chemistry rather than physics. */
  const matchedSpecialisation = useMemo(() => {
    const owned = new Set(rec.features)
    return [...ROOM_SPECIALISATIONS]
      .filter(
        sp =>
          sp.kind === rec.kind && sp.features.length > 0 && sp.features.every(f => owned.has(f)),
      )
      .toSorted((a, b) => b.features.length - a.features.length)[0]?.id
  }, [rec.features, rec.kind])

  const toggleSlot = (day: number, slot: number) => {
    const key = `${day}:${slot}`
    set({
      blockedSlots: rec.blockedSlots.includes(key)
        ? rec.blockedSlots.filter(x => x !== key)
        : [...rec.blockedSlots, key],
    })
  }

  return (
    <div className="record-editor">
      <div className="field-grid">
        <Field label="Room name">
          <TextInput value={rec.name} ariaLabel="Room name" onChange={v => set({ name: v })} />
        </Field>
        <Field label="Building">
          <Combobox
            value={rec.buildingId}
            ariaLabel="Building"
            options={config.buildings.map(b => ({ value: b.id, label: b.name }))}
            onChange={v => set({ buildingId: v })}
          />
        </Field>
        <Field label="Floor" hint={HELP.floors}>
          <NumberInput
            value={rec.floor}
            min={0}
            max={Math.max(1, building?.floors ?? 1)}
            onChange={n => set({ floor: n })}
          />
        </Field>
        <Field label="Room type">
          <Combobox
            value={rec.kind}
            ariaLabel="Room type"
            options={SELECTABLE_ROOM_KINDS.map(k => ({ value: k, label: k }))}
            onChange={v => set({ kind: v as RoomKind })}
          />
        </Field>
        <Field label="Specialised facility" hint={HELP.specialisation}>
          <Combobox
            value={matchedSpecialisation ?? ''}
            ariaLabel="Specialised facility"
            options={[
              { value: '', label: 'General purpose' },
              ...ROOM_SPECIALISATIONS.map(sp => ({
                value: sp.id,
                label: sp.label,
                hint: sp.kind,
                keywords: sp.hint,
              })),
            ]}
            onChange={v => {
              const spec = specialisationById(v)
              if (!spec) return
              /* Applying a facility adds what it cannot work without and leaves
                 anything else already ticked alone — an accessible chemistry lab
                 must not lose its step-free flag on being renamed. */
              set({
                kind: spec.kind,
                features: [...new Set([...rec.features, ...spec.features])],
                turnoverMinutes: Math.max(rec.turnoverMinutes, spec.turnoverMinutes),
              })
            }}
          />
        </Field>
        <Field label="Seats" hint={HELP.roomCapacity}>
          <NumberInput
            value={rec.capacity}
            min={1}
            max={2000}
            onChange={n => set({ capacity: n })}
          />
        </Field>
        <Field label="Turnover" hint={HELP.turnoverMinutes}>
          <NumberInput
            value={rec.turnoverMinutes}
            min={0}
            max={180}
            step={5}
            suffix="min"
            onChange={n => set({ turnoverMinutes: n })}
          />
        </Field>
      </div>

      <div className="divider" />

      <div className="field-label" style={{ marginBottom: 4 }}>
        Capabilities
      </div>
      <div className="feature-grid" style={{ marginBottom: 14 }}>
        {FEATURE_PRESETS.map(f => {
          const on = rec.features.includes(f.key)
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              title={f.hint}
              className={`feature-chip ${on ? 'on' : ''}`}
              onClick={() =>
                set({
                  features: on ? rec.features.filter(x => x !== f.key) : [...rec.features, f.key],
                })
              }
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <div className="divider" />

      <div className="field-label" style={{ marginBottom: 4 }}>
        Availability
      </div>
      <p className="field-hint" style={{ marginBottom: 10 }}>
        {HELP.closedDays} Tick individual cells to block single periods — maintenance windows, a
        standing departmental booking, anything the timetable must not use.
      </p>

      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {grid.days.map(d => {
          const closed = rec.closedDays.includes(d)
          return (
            <button
              key={d}
              type="button"
              aria-pressed={closed}
              className={`day-toggle ${closed ? 'on' : ''}`}
              title={closed ? `${DAY_NAMES[d]}: closed all day` : `${DAY_NAMES[d]}: open`}
              onClick={() =>
                set({
                  closedDays: closed
                    ? rec.closedDays.filter(x => x !== d)
                    : [...rec.closedDays, d].toSorted((a, b) => a - b),
                })
              }
            >
              {DAY_SHORT[d]} {closed ? 'closed' : 'open'}
            </button>
          )
        })}
      </div>

      <div
        className="avail-grid"
        style={{ gridTemplateColumns: `56px repeat(${grid.slots}, 1fr)` }}
      >
        <span />
        {grid.labels.map(l => (
          <span key={l} className="heat-time">
            {l}
          </span>
        ))}
        {grid.days.map(day => (
          <AvailRow
            key={day}
            day={day}
            slots={grid.slots}
            closed={rec.closedDays.includes(day)}
            blocked={rec.blockedSlots}
            onToggle={toggleSlot}
          />
        ))}
      </div>

      <div className="divider" />

      <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
        <label className="row" style={{ gap: 10 }}>
          <Switch
            on={rec.restricted}
            label="Keep out of the bookable pool"
            onChange={() => set({ restricted: !rec.restricted })}
          />
          <span className="small">Keep out of the bookable pool</span>
        </label>
        <button
          className="btn btn-danger-soft"
          style={{ marginLeft: 'auto' }}
          onClick={props.onRemove}
        >
          Remove this room
        </button>
      </div>
    </div>
  )
}

function AvailRow(props: {
  day: number
  slots: number
  closed: boolean
  blocked: string[]
  onToggle: (day: number, slot: number) => void
}) {
  return (
    <>
      <span className="heat-label">{DAY_SHORT[props.day]}</span>
      {Array.from({ length: props.slots }, (_, slot) => {
        const off = props.closed || props.blocked.includes(`${props.day}:${slot}`)
        return (
          <button
            key={slot}
            type="button"
            disabled={props.closed}
            aria-pressed={off}
            className={`avail-cell ${off ? 'off' : ''}`}
            title={`${DAY_NAMES[props.day]} slot ${slot + 1}: ${off ? 'unavailable' : 'available'}`}
            onClick={() => props.onToggle(props.day, slot)}
          />
        )
      })}
    </>
  )
}

/* ================================================================== *
 * Courses
 * ================================================================== */

function CoursesTab() {
  const { institution, config, editCourse, addCourse, removeCourse } = useApp()
  const toast = useToast()
  const [dept, setDept] = useState(config.departments[0]?.code ?? '')
  const [year, setYear] = useState<number | 'all'>('all')
  const [open, setOpen] = useState<string | null>(null)

  const owned = Boolean(config.overrides?.courses)
  const records = useMemo(
    () => config.overrides?.courses ?? courseRecordsFrom(institution),
    [config.overrides?.courses, institution],
  )

  const program = config.programs.find(p => p.dept === dept)
  const years = Array.from({ length: Math.max(1, program?.years ?? 1) }, (_, k) => k + 1)
  const rows = records.filter(r => r.dept === dept && (year === 'all' || r.year === year))

  return (
    <>
      <OwnershipBar kind="courses" owned={owned} />

      <div className="filter-bar">
        <label className="row" style={{ gap: 8 }}>
          <span className="small muted">Department</span>
          <Combobox
            value={dept}
            ariaLabel="Department"
            width={230}
            options={config.departments.map(d => ({ value: d.code, label: d.code, hint: d.name }))}
            onChange={setDept}
          />
        </label>
        <Segmented
          value={String(year)}
          ariaLabel="Year"
          onChange={v => setYear(v === 'all' ? 'all' : Number(v))}
          options={[
            { value: 'all', label: 'All years' },
            ...years.map(y => ({ value: String(y), label: `Year ${y}` })),
          ]}
        />
        <button
          className="btn btn-soft"
          style={{ marginLeft: 'auto' }}
          disabled={!program}
          title={
            program
              ? undefined
              : `${dept} has no programme, so a course there would have no sections to teach`
          }
          onClick={() => {
            if (!program) return
            const target = year === 'all' ? 1 : year
            addCourse(dept, program.id, target)
            toast(`Course added to ${dept} year ${target}`)
          }}
        >
          + Add course
        </button>
      </div>

      {/* A course belongs to a programme, and cohorts come from programmes. Adding
          one to a department with no programme creates a class nobody attends. */}
      {!program && (
        <Callout tone="warn" title={`${dept} has no programme yet`}>
          Courses are taught to the sections of a programme, so this department cannot hold any
          until one exists. Add a programme for {dept} in Setup → Programmes.
        </Callout>
      )}

      {program && rows.length === 0 && (
        <Callout tone="info" title="No courses match that filter">
          Add one with the button above, or widen the year filter.
        </Callout>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        {rows.map((rec, idx) => {
          const expanded = open === rec.id
          return (
            <div key={rec.id}>
              {idx > 0 && <div className="divider" style={{ margin: 0 }} />}
              <div className="record-row">
                <button
                  className="record-toggle"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : rec.id)}
                >
                  <span className="chip chip-soft mono" style={{ flexShrink: 0 }}>
                    {rec.code}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="record-name">{rec.name}</span>
                    <span className="record-sub">
                      Year {rec.year} · {rec.kind} · {rec.weekly}×/week
                      {rec.blockLength > 1 ? ` · ${rec.blockLength}-slot block` : ''}
                      {rec.suspended && ' · suspended'}
                    </span>
                  </span>
                  <span className={`domain-caret ${expanded ? 'open' : ''}`} aria-hidden>
                    ›
                  </span>
                </button>
              </div>

              {expanded && (
                <CourseEditor
                  rec={rec}
                  onChange={editCourse}
                  onRemove={() => {
                    removeCourse(rec.id)
                    setOpen(null)
                    toast(`Removed ${rec.code}`)
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function CourseEditor(props: {
  rec: CourseRecord
  onChange: (r: CourseRecord) => void
  onRemove: () => void
}) {
  const { config } = useApp()
  const { rec } = props
  const set = (p: Partial<CourseRecord>) => props.onChange({ ...rec, ...p })

  return (
    <div className="record-editor">
      <div className="field-grid">
        <Field label="Code">
          <TextInput value={rec.code} ariaLabel="Course code" onChange={v => set({ code: v })} />
        </Field>
        <Field label="Name" wide>
          <TextInput value={rec.name} ariaLabel="Course name" onChange={v => set({ name: v })} />
        </Field>
        <Field label="Department">
          <Combobox
            value={rec.dept}
            ariaLabel="Department"
            options={config.departments.map(d => ({ value: d.code, label: d.code, hint: d.name }))}
            onChange={v => set({ dept: v })}
          />
        </Field>
        <Field label="Programme">
          <Combobox
            value={rec.programId}
            ariaLabel="Programme"
            emptyText={`No programmes in ${rec.dept}`}
            options={config.programs
              .filter(p => p.dept === rec.dept)
              .map(p => ({ value: p.id, label: p.code, hint: p.name }))}
            onChange={v => set({ programId: v })}
          />
        </Field>
        <Field label="Year / semester">
          <NumberInput value={rec.year} min={1} max={8} onChange={n => set({ year: n })} />
        </Field>
        <Field label="Type">
          <Combobox
            value={rec.kind}
            ariaLabel="Course type"
            options={COURSE_KINDS.map(k => ({ value: k, label: k }))}
            onChange={v => set({ kind: v as CourseKind })}
          />
        </Field>
        <Field label="Meetings per week" hint={HELP.coreWeekly}>
          <NumberInput value={rec.weekly} min={0} max={10} onChange={n => set({ weekly: n })} />
        </Field>
        <Field label="Slots per meeting" hint={HELP.labBlock}>
          <NumberInput
            value={rec.blockLength}
            min={1}
            max={6}
            onChange={n => set({ blockLength: n })}
          />
        </Field>
        <Field label="Needs room type">
          <Combobox
            value={rec.roomKind}
            ariaLabel="Room type"
            options={SELECTABLE_ROOM_KINDS.map(k => ({ value: k, label: k }))}
            onChange={v => set({ roomKind: v as RoomKind })}
          />
        </Field>
      </div>

      <div className="divider" />

      <div className="field-label" style={{ marginBottom: 4 }}>
        Room capabilities this course needs
      </div>
      <p className="field-hint" style={{ marginBottom: 10 }}>
        Leave empty unless the course genuinely cannot run without it — each one narrows the rooms
        the scheduler may use.
      </p>
      <div className="feature-grid">
        {FEATURE_PRESETS.map(f => {
          const on = rec.requires.includes(f.key)
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              title={f.hint}
              className={`feature-chip ${on ? 'on' : ''}`}
              onClick={() =>
                set({
                  requires: on ? rec.requires.filter(x => x !== f.key) : [...rec.requires, f.key],
                })
              }
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <div className="divider" />

      <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
        <label className="row" style={{ gap: 10 }}>
          <Switch
            on={rec.suspended}
            label="Suspended"
            onChange={() => set({ suspended: !rec.suspended })}
          />
          <span className="small">Suspended — keep the record, schedule nothing</span>
        </label>
        <button
          className="btn btn-danger-soft"
          style={{ marginLeft: 'auto' }}
          onClick={props.onRemove}
        >
          Delete this course
        </button>
      </div>
    </div>
  )
}

/* ================================================================== *
 * Cohorts
 * ================================================================== */

function CohortsTab() {
  const { institution, sessions, config, setSections } = useApp()

  const hoursByCohort = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sessions) m.set(s.cohortId, (m.get(s.cohortId) ?? 0) + s.length)
    return m
  }, [sessions])

  const totalStudents = institution.cohorts.reduce((a, c) => a + c.size, 0)
  const overrides = config.overrides?.sections ?? {}

  return (
    <>
      <Callout tone="info" title="What a section is">
        {HELP.cohort}
      </Callout>

      <Section
        title="Sections by department and year"
        hint="Add or remove sections without touching the programme defaults"
      >
        <div className="stack" style={{ gap: 12 }}>
          {config.programs.map(program => {
            const dept = institution.departments.find(d => d.code === program.dept)
            return (
              <div key={program.id} className="card card-pad">
                <div className="spread" style={{ marginBottom: 12 }}>
                  <span className="row" style={{ gap: 8 }}>
                    <span
                      className="dot"
                      style={{ background: SERIES[(dept?.colorIndex ?? 0) % SERIES.length] }}
                    />
                    <b>{program.code}</b>
                    <span className="small muted">{program.name}</span>
                  </span>
                  <span className="small muted">
                    {program.studentsPerSection} students per section
                  </span>
                </div>
                <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
                  {Array.from({ length: Math.max(1, program.years) }, (_, k) => k + 1).map(year => (
                    <label key={year} className="row" style={{ gap: 8 }}>
                      <span className="small muted" style={{ minWidth: 46 }}>
                        Year {year}
                      </span>
                      <span style={{ width: 92 }}>
                        <NumberInput
                          value={overrides[`${program.id}:${year}`] ?? program.sectionsPerYear}
                          min={0}
                          max={30}
                          ariaLabel={`${program.code} year ${year} sections`}
                          onChange={n => setSections(program.id, year, n)}
                        />
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      <Section
        title="Sections"
        hint={`${totalStudents.toLocaleString()} students in ${institution.cohorts.length} cohorts`}
      >
        <div className="grid grid-3">
          {institution.departments.map(dept => {
            const rows = institution.cohorts.filter(c => c.deptId === dept.id)
            if (rows.length === 0) return null
            return (
              <div key={dept.id} className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">{dept.code}</div>
                    <div className="card-sub">{dept.name}</div>
                  </div>
                  <span
                    className="dot"
                    style={{ background: SERIES[dept.colorIndex % SERIES.length] }}
                  />
                </div>
                <div className="card-pad stack" style={{ gap: 8, paddingTop: 12 }}>
                  {rows.map(c => (
                    <div key={c.id} className="panel spread" style={{ padding: '10px 14px' }}>
                      <span>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{c.name}</span>
                        {c.needsAccessibleRooms && (
                          <span className="chip chip-accent" style={{ marginLeft: 8 }}>
                            access needs
                          </span>
                        )}
                      </span>
                      <span className="small muted tnum">
                        {c.size} students · {hoursByCohort.get(c.id) ?? 0} h/wk
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Section>
    </>
  )
}
