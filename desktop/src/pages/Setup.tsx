import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../store'
import { useToast } from '../components/Toast'
import {
  Callout, Field, Hero, Meter, NumberInput, Pill, Section, Segmented, TextInput,
} from '../components/ui'
import {
  slotsPerDay,
  type BuildingConfig, type ProgramConfig, type RoomGroupConfig, type SetupConfig,
} from '../data/config'
import {
  DAY_NAMES, DAY_SHORT, ROOM_KINDS, minutesToLabel, labelToMinutes, type RoomKind,
} from '../data/model'
import { FEATURE_PRESETS, ROOM_SPECIALISATIONS, specialisationById } from '../data/records'
import { prettyRange } from '../data/academicCalendar'
import { HELP } from '../data/help'

type StepId = 'institution' | 'calendar' | 'programs' | 'rooms' | 'faculty' | 'review'

const STEPS: { id: StepId; name: string; blurb: string }[] = [
  { id: 'institution', name: 'Institution', blurb: 'Name, year and term' },
  { id: 'calendar', name: 'Teaching week', blurb: 'Days, hours, the slot grid and the term' },
  { id: 'programs', name: 'Programmes', blurb: 'Students, sections and course load' },
  { id: 'rooms', name: 'Rooms', blurb: 'Blocks, floors and specialised labs' },
  { id: 'faculty', name: 'Faculty', blurb: 'Headcount, ranks and legal caps' },
  { id: 'review', name: 'Review', blurb: 'Feasibility before you solve' },
]

let uid = 1
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${uid++}`

export function Setup() {
  const { config, summary, setConfig, resetConfig, completeSetup, setupComplete, solving } = useApp()
  const [step, setStep] = useState<StepId>('institution')
  const toast = useToast()
  const navigate = useNavigate()

  const index = STEPS.findIndex(s => s.id === step)
  const blocked = summary.errors.length > 0

  const patch = (p: Partial<SetupConfig>) => setConfig(p)

  const finish = async () => {
    if (blocked) {
      toast('Resolve the blocking issues before generating', 'danger')
      setStep('review')
      return
    }
    await completeSetup()
    toast('Timetable generated', 'ok')
    navigate('/timetable')
  }

  return (
    <div className="fade-in">
      <Hero
        eyebrow={setupComplete ? 'Institution setup' : 'Step 1 — describe your institution'}
        title={<>Tell Aula <strong>what you actually have</strong></>}
        desc="Every number below is yours to set — students, programmes, classrooms, staff, hours. The engine schedules against these figures and nothing else."
        side={
          <div className="row" style={{ gap: 8 }}>
            <Pill tone={blocked ? 'danger' : 'ok'}>
              {blocked ? `${summary.errors.length} blocking` : 'Configuration valid'}
            </Pill>
            <button className="btn btn-ghost" onClick={() => { resetConfig(); toast('Reset to defaults') }}>
              Reset
            </button>
          </div>
        }
      />

      <main className="page">
        <div className="wizard">
          <nav className="wizard-rail" aria-label="Setup steps">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                className={`wizard-step ${s.id === step ? 'active' : ''} ${i < index ? 'done' : ''}`}
                onClick={() => setStep(s.id)}
                aria-current={s.id === step ? 'step' : undefined}
              >
                <span className="wizard-num">{i < index ? '✓' : i + 1}</span>
                <span>
                  <span className="wizard-name">{s.name}</span>
                  <span className="wizard-blurb">{s.blurb}</span>
                </span>
              </button>
            ))}

            <div className="wizard-summary">
              <div className="spread small"><span className="muted">Students</span><b className="tnum">{summary.students.toLocaleString()}</b></div>
              <div className="spread small"><span className="muted">Cohorts</span><b className="tnum">{summary.cohorts}</b></div>
              <div className="spread small"><span className="muted">Courses</span><b className="tnum">{summary.courses}</b></div>
              <div className="spread small"><span className="muted">Rooms</span><b className="tnum">{summary.rooms}</b></div>
              <div className="spread small"><span className="muted">Faculty</span><b className="tnum">{summary.facultyTotal}</b></div>
              <div className="divider" />
              <Meter
                value={Number.isFinite(summary.pressure) ? Math.min(summary.pressure, 1) : 1}
                label="Room pressure"
                tone={summary.pressure > 0.85 ? 'var(--danger)' : summary.pressure > 0.6 ? 'var(--warn)' : 'var(--ok)'}
              />
              <p className="small muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
                {summary.demand} weekly sessions into {summary.roomSlotsPerWeek} room-slots.
              </p>
            </div>
          </nav>

          <div className="wizard-body">
            {step === 'institution' && <StepInstitution config={config} patch={patch} />}
            {step === 'calendar' && <StepCalendar config={config} patch={patch} />}
            {step === 'programs' && <StepPrograms config={config} patch={patch} />}
            {step === 'rooms' && <StepRooms config={config} patch={patch} />}
            {step === 'faculty' && <StepFaculty config={config} patch={patch} />}
            {step === 'review' && <StepReview />}

            <div className="wizard-actions">
              <button
                className="btn btn-ghost"
                disabled={index === 0}
                onClick={() => setStep(STEPS[Math.max(0, index - 1)].id)}
              >
                ← Back
              </button>
              <div className="row" style={{ gap: 10 }}>
                {index < STEPS.length - 1 ? (
                  <button className="btn btn-primary" onClick={() => setStep(STEPS[index + 1].id)}>
                    Continue →
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={finish} disabled={solving}>
                    {solving ? 'Solving…' : '✦ Generate timetable'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

/* ================================================================== *
 * Steps
 * ================================================================== */

interface StepProps {
  config: SetupConfig
  patch: (p: Partial<SetupConfig>) => void
}

function StepInstitution({ config, patch }: StepProps) {
  const inst = config.institution
  return (
    <Section title="Institution" hint="Appears on every exported timetable">
      <div className="card card-pad">
        <div className="field-grid">
          <Field label="Institution name" wide>
            <TextInput value={inst.name} onChange={v => patch({ institution: { ...inst, name: v } })} />
          </Field>
          <Field label="Academic year">
            <TextInput value={inst.academicYear} onChange={v => patch({ institution: { ...inst, academicYear: v } })} />
          </Field>
          <Field label="Term">
            <TextInput value={inst.term} onChange={v => patch({ institution: { ...inst, term: v } })} />
          </Field>
          <Field label="Generator seed" hint={HELP.seed}>
            <NumberInput value={config.seed} min={1} onChange={n => patch({ seed: n })} />
          </Field>
        </div>
      </div>

      <div style={{ height: 20 }} />

      <Section title="Departments" hint="Programmes attach to these">
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead><tr><th style={{ width: 120 }}>Code</th><th>Name</th><th style={{ width: 70 }} /></tr></thead>
            <tbody>
              {config.departments.map((d, i) => (
                <tr key={i}>
                  <td>
                    <TextInput
                      value={d.code} ariaLabel="Department code"
                      onChange={v => {
                        const next = [...config.departments]
                        next[i] = { ...d, code: v.toUpperCase() }
                        patch({ departments: next })
                      }}
                    />
                  </td>
                  <td>
                    <TextInput
                      value={d.name} ariaLabel="Department name"
                      onChange={v => {
                        const next = [...config.departments]
                        next[i] = { ...d, name: v }
                        patch({ departments: next })
                      }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-danger-soft"
                      onClick={() => patch({ departments: config.departments.filter((_, x) => x !== i) })}
                    >Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="card-pad">
            <button
              className="btn btn-soft"
              onClick={() => patch({ departments: [...config.departments, { code: 'NEW', name: 'New department' }] })}
            >+ Add department</button>
          </div>
        </div>
      </Section>
    </Section>
  )
}

function StepCalendar({ config, patch }: StepProps) {
  const cal = config.calendar
  const set = (p: Partial<typeof cal>) => patch({ calendar: { ...cal, ...p } })
  const perDay = slotsPerDay(cal)

  const preview = useMemo(() => {
    const start = labelToMinutes(cal.dayStart)
    return Array.from({ length: Math.min(perDay, 16) }, (_, i) => minutesToLabel(start + i * cal.slotMinutes))
  }, [cal.dayStart, cal.slotMinutes, perDay])

  return (
    <Section title="Teaching week" hint="The grid every session must land on">
      <div className="card card-pad">
        <Field label="Working days" wide hint="Click to include or exclude a day.">
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {DAY_SHORT.map((d, i) => {
              const on = cal.workingDays.includes(i)
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  className={`day-toggle ${on ? 'on' : ''}`}
                  onClick={() => set({
                    workingDays: on
                      ? cal.workingDays.filter(x => x !== i)
                      : [...cal.workingDays, i].sort((a, b) => a - b),
                  })}
                >{d}</button>
              )
            })}
          </div>
        </Field>

        <div className="divider" />

        <div className="field-grid">
          <Field label="Day starts"><TextInput type="time" value={cal.dayStart} onChange={v => set({ dayStart: v })} /></Field>
          <Field label="Day ends"><TextInput type="time" value={cal.dayEnd} onChange={v => set({ dayEnd: v })} /></Field>
          <Field label="Slot length"><NumberInput value={cal.slotMinutes} min={15} max={240} step={5} suffix="min" onChange={n => set({ slotMinutes: n })} /></Field>
          <Field label="Passing time" hint={HELP.passingMinutes}>
            <NumberInput value={cal.passingMinutes} min={0} max={60} step={5} suffix="min" onChange={n => set({ passingMinutes: n })} />
          </Field>
          <Field label="Lunch starts"><TextInput type="time" value={cal.lunchStart} onChange={v => set({ lunchStart: v })} /></Field>
          <Field label="Lunch length"><NumberInput value={cal.lunchMinutes} min={0} max={180} step={15} suffix="min" onChange={n => set({ lunchMinutes: n })} /></Field>
          <Field label="Evening starts" hint={HELP.eveningStart}>
            <TextInput type="time" value={cal.eveningStart} onChange={v => set({ eveningStart: v })} />
          </Field>
          <Field label="Early morning until" hint={HELP.earlyMorningUntil}>
            <TextInput type="time" value={cal.earlyMorningUntil} onChange={v => set({ earlyMorningUntil: v })} />
          </Field>
        </div>

        <div className="divider" />

        <div className="spread" style={{ marginBottom: 4 }}>
          <span className="field-label">Term dates</span>
          <Link className="btn btn-ghost" to="/calendar">Open the academic calendar →</Link>
        </div>
        <p className="field-hint" style={{ marginBottom: 12 }}>{HELP.termDates}</p>
        <div className="field-grid">
          <Field label="Term starts">
            <input
              className="input"
              type="date"
              aria-label="Term starts"
              value={cal.termStart}
              onChange={e => set({ termStart: e.target.value })}
            />
          </Field>
          <Field label="Term ends">
            <input
              className="input"
              type="date"
              aria-label="Term ends"
              value={cal.termEnd}
              onChange={e => set({ termEnd: e.target.value })}
            />
          </Field>
          <Field label="Weeks in term" hint="Used only when the dates above are not set.">
            <NumberInput value={cal.termWeeks} min={1} max={52} onChange={n => set({ termWeeks: n })} />
          </Field>
        </div>

        <CalendarImpactStrip />

        <div className="divider" />

        <div className="small muted" style={{ marginBottom: 8 }}>
          {perDay} slot{perDay === 1 ? '' : 's'} per day × {cal.workingDays.length} day{cal.workingDays.length === 1 ? '' : 's'} = <b className="tnum">{perDay * cal.workingDays.length}</b> teaching slots a week
        </div>
        <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
          {preview.map(t => <span key={t} className="chip chip-soft mono">{t}</span>)}
          {perDay > 16 && <span className="small muted">+{perDay - 16} more</span>}
        </div>
      </div>
    </Section>
  )
}

function StepPrograms({ config, patch }: StepProps) {
  const update = (i: number, p: Partial<ProgramConfig>) => {
    const next = [...config.programs]
    next[i] = { ...next[i], ...p }
    patch({ programs: next })
  }

  return (
    <Section title="Programmes" hint="Students exist as cohorts — sections the engine schedules as a unit">
      <div className="stack" style={{ gap: 14 }}>
        {config.programs.map((p, i) => {
          const cohorts = p.years * p.sectionsPerYear
          const students = cohorts * p.studentsPerSection
          const weekly = p.coreCourses * p.coreWeekly + p.labCourses * p.labBlock + p.electiveCourses * 2
          return (
            <div key={p.id} className="card">
              <div className="card-head">
                <div className="row" style={{ gap: 10, flex: 1, minWidth: 0 }}>
                  <TextInput value={p.code} ariaLabel="Programme code" onChange={v => update(i, { code: v })} />
                  <TextInput value={p.name} ariaLabel="Programme name" onChange={v => update(i, { name: v })} />
                </div>
                <button className="btn btn-danger-soft" onClick={() => patch({ programs: config.programs.filter((_, x) => x !== i) })}>
                  Remove
                </button>
              </div>

              <div className="card-pad">
                <div className="field-grid">
                  <Field label="Department">
                    <select className="select" value={p.dept} onChange={e => update(i, { dept: e.target.value })} aria-label="Department">
                      {config.departments.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Mode">
                    <Segmented
                      value={p.mode}
                      ariaLabel="Programme mode"
                      onChange={v => update(i, { mode: v })}
                      options={[
                        { value: 'day', label: 'Day' },
                        { value: 'evening', label: 'Evening' },
                        { value: 'weekend', label: 'Weekend' },
                      ]}
                    />
                  </Field>
                  <Field label="Years"><NumberInput value={p.years} min={1} max={8} onChange={n => update(i, { years: n })} /></Field>
                  <Field label="Sections per year" hint={HELP.sectionsPerYear}>
                    <NumberInput value={p.sectionsPerYear} min={1} max={20} onChange={n => update(i, { sectionsPerYear: n })} />
                  </Field>
                  <Field label="Students per section" hint={HELP.studentsPerSection}>
                    <NumberInput value={p.studentsPerSection} min={1} max={600} onChange={n => update(i, { studentsPerSection: n })} />
                  </Field>
                  <Field label="Core courses / year" hint={HELP.coreCourses}>
                    <NumberInput value={p.coreCourses} min={0} max={12} onChange={n => update(i, { coreCourses: n })} />
                  </Field>
                  <Field label="Meetings per core course" hint={HELP.coreWeekly}>
                    <NumberInput value={p.coreWeekly} min={1} max={6} onChange={n => update(i, { coreWeekly: n })} />
                  </Field>
                  <Field label="Lab courses / year" hint={HELP.labCourses}>
                    <NumberInput value={p.labCourses} min={0} max={8} onChange={n => update(i, { labCourses: n })} />
                  </Field>
                  <Field label="Lab block length" hint={HELP.labBlock}>
                    <NumberInput value={p.labBlock} min={1} max={6} suffix="slots" onChange={n => update(i, { labBlock: n })} />
                  </Field>
                  <Field label="Electives / year" hint={HELP.electiveCourses}>
                    <NumberInput value={p.electiveCourses} min={0} max={8} onChange={n => update(i, { electiveCourses: n })} />
                  </Field>
                </div>

                <SectionOverrides program={p} />

                <div className="panel spread" style={{ marginTop: 14, padding: '11px 16px' }}>
                  <span className="small muted">{cohorts} cohorts · {students.toLocaleString()} students</span>
                  <span className="small"><b className="tnum">{weekly}</b> <span className="muted">slot-hours per section per week</span></span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 14 }}>
        <button
          className="btn btn-soft"
          onClick={() => patch({
            programs: [...config.programs, {
              id: nextId('p'), code: 'NEW', name: 'New programme',
              dept: config.departments[0]?.code ?? 'GEN',
              years: 3, sectionsPerYear: 1, studentsPerSection: 60, mode: 'day',
              coreCourses: 4, labCourses: 1, electiveCourses: 1, coreWeekly: 3, labBlock: 2,
            }],
          })}
        >+ Add programme</button>
      </div>
    </Section>
  )
}

/**
 * Buildings, floor by floor.
 *
 * The earlier version described the estate as a flat list of room groups with a
 * building attached, which cannot say the thing every real block is: halls on
 * the ground, tutorial rooms above, the specialised labs wherever the services
 * run. Rooms are now entered under the storey they occupy, and picking a
 * facility carries the capabilities that facility cannot work without — so an
 * administrator who knows they have two electronics labs on the second floor
 * does not also have to know what that means to the constraint engine.
 */
function StepRooms({ config, patch }: StepProps) {
  const [openFeatures, setOpenFeatures] = useState<string | null>(null)

  const updateBuilding = (i: number, p: Partial<BuildingConfig>) => {
    const next = [...config.buildings]
    const building = { ...next[i], ...p }
    next[i] = building

    /* Storeys can be reduced after rooms were laid out on the upper ones. Those
       rooms still exist, so they come down to the new top floor rather than
       disappearing into a floor nobody can reach. */
    const groups = config.roomGroups.map(g =>
      g.buildingId === building.id && g.floor > building.floors
        ? { ...g, floor: building.floors }
        : g)

    patch({ buildings: next, roomGroups: groups })
  }

  const updateGroup = (id: string, p: Partial<RoomGroupConfig>) => {
    patch({ roomGroups: config.roomGroups.map(g => (g.id === id ? { ...g, ...p } : g)) })
  }

  const removeGroup = (id: string) => {
    patch({ roomGroups: config.roomGroups.filter(g => g.id !== id) })
    if (openFeatures === id) setOpenFeatures(null)
  }

  const addGroup = (buildingId: string, floor: number) => {
    const preset = ROOM_SPECIALISATIONS[0]
    patch({
      roomGroups: [...config.roomGroups, {
        id: nextId('rg'),
        buildingId,
        floor,
        kind: preset.kind,
        count: 2,
        capacity: preset.capacity,
        turnoverMinutes: preset.turnoverMinutes,
        features: [...preset.features],
        specialisation: preset.id,
      }],
    })
  }

  /** Applying a facility resets the group to what that facility actually is. */
  const applySpecialisation = (g: RoomGroupConfig, specId: string) => {
    const spec = specialisationById(specId)
    if (!spec) { updateGroup(g.id, { specialisation: undefined }); return }
    updateGroup(g.id, {
      specialisation: spec.id,
      kind: spec.kind,
      capacity: spec.capacity,
      turnoverMinutes: spec.turnoverMinutes,
      // keep anything extra the user ticked, add whatever the facility needs
      features: [...new Set([...g.features, ...spec.features])],
    })
  }

  const totalRooms = config.roomGroups.reduce((a, g) => a + Math.max(0, g.count), 0)

  return (
    <>
      <Section
        title="Buildings"
        hint={`${config.buildings.length} block${config.buildings.length === 1 ? '' : 's'} · ${totalRooms} rooms`}
      >
        <div className="stack" style={{ gap: 16 }}>
          {config.buildings.map((b, i) => {
            const mine = config.roomGroups.filter(g => g.buildingId === b.id)
            const rooms = mine.reduce((a, g) => a + Math.max(0, g.count), 0)
            const floors = Array.from({ length: Math.max(1, b.floors) }, (_, k) => k + 1)

            return (
              <div key={b.id} className="card">
                <div className="card-head">
                  <div className="row" style={{ gap: 10, flex: 1, minWidth: 0 }}>
                    <TextInput
                      value={b.name}
                      ariaLabel="Building name"
                      onChange={v => updateBuilding(i, { name: v })}
                    />
                    <span className="chip chip-soft tnum" style={{ flexShrink: 0 }}>
                      {rooms} room{rooms === 1 ? '' : 's'}
                    </span>
                  </div>
                  <button
                    className="btn btn-danger-soft"
                    onClick={() => patch({
                      buildings: config.buildings.filter((_, x) => x !== i),
                      roomGroups: config.roomGroups.filter(g => g.buildingId !== b.id),
                    })}
                  >Remove block</button>
                </div>

                <div className="card-pad">
                  <div className="field-grid">
                    {config.campuses.length > 1 && (
                      <Field label="Campus">
                        <select
                          className="select"
                          value={b.campus}
                          aria-label="Campus"
                          onChange={e => updateBuilding(i, { campus: e.target.value })}
                        >
                          {config.campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </Field>
                    )}
                    <Field label="Number of floors" hint={HELP.floors}>
                      <select
                        className="select"
                        value={b.floors}
                        aria-label="Number of floors"
                        onChange={e => updateBuilding(i, { floors: Number(e.target.value) })}
                      >
                        {Array.from({ length: 20 }, (_, k) => k + 1).map(n => (
                          <option key={n} value={n}>
                            {n} floor{n === 1 ? '' : 's'}{n === 1 ? ' (ground only)' : ''}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Walk time to other blocks" hint={HELP.walkMinutes}>
                      <NumberInput
                        value={b.walkMinutes} min={0} max={120} suffix="min" ariaLabel="Walk time"
                        onChange={n => updateBuilding(i, { walkMinutes: n })}
                      />
                    </Field>
                    <Field label="Access" hint={HELP.hasElevator}>
                      <div className="row" style={{ gap: 18, flexWrap: 'wrap', minHeight: 34 }}>
                        <label className="row small" style={{ gap: 7 }}>
                          <input
                            type="checkbox" checked={b.hasElevator} aria-label="Has lift"
                            onChange={() => updateBuilding(i, { hasElevator: !b.hasElevator })}
                          />
                          Has a lift
                        </label>
                        <label className="row small" style={{ gap: 7 }}>
                          <input
                            type="checkbox" checked={b.accessible} aria-label="Accessible"
                            onChange={() => updateBuilding(i, { accessible: !b.accessible })}
                          />
                          Step-free entry
                        </label>
                      </div>
                    </Field>
                  </div>

                  {!b.hasElevator && b.floors > 1 && (
                    <div style={{ marginTop: 14 }}>
                      <Callout tone="info" title="No lift in this block">
                        Anyone with an access need can only be scheduled on the ground floor here,
                        so keep at least one room of each type they need on floor 1.
                      </Callout>
                    </div>
                  )}

                  <div className="divider" style={{ margin: '18px 0 14px' }} />

                  <div className="spread" style={{ marginBottom: 12 }}>
                    <span className="field-label">Rooms on each floor</span>
                    <span className="small muted">
                      A floor can hold as many kinds of room as it really does
                    </span>
                  </div>

                  {floors.map(floor => {
                    const onFloor = mine.filter(g => g.floor === floor)
                    return (
                      <div key={floor} className="floor-block">
                        <div className="floor-head">
                          <span className="floor-badge">
                            {floor === 1 ? 'Ground' : `Floor ${floor}`}
                          </span>
                          <span className="small muted">
                            {onFloor.reduce((a, g) => a + Math.max(0, g.count), 0)} rooms
                          </span>
                          <button
                            className="btn btn-soft"
                            style={{ marginLeft: 'auto' }}
                            onClick={() => addGroup(b.id, floor)}
                          >
                            + Add room type
                          </button>
                        </div>

                        {onFloor.length === 0 && (
                          <p className="small muted" style={{ padding: '4px 0 2px' }}>
                            Nothing on this floor yet.
                          </p>
                        )}

                        {onFloor.map(g => (
                          <div key={g.id}>
                            <div className="room-line">
                              <Field label="Facility" hint={undefined}>
                                <select
                                  className="select"
                                  value={g.specialisation ?? ''}
                                  aria-label="Facility"
                                  onChange={e => applySpecialisation(g, e.target.value)}
                                >
                                  <option value="">General purpose</option>
                                  {ROOM_SPECIALISATIONS.map(sp => (
                                    <option key={sp.id} value={sp.id} title={sp.hint}>{sp.label}</option>
                                  ))}
                                </select>
                              </Field>
                              <Field label="Room type">
                                <select
                                  className="select"
                                  value={g.kind}
                                  aria-label="Room type"
                                  onChange={e => updateGroup(g.id, { kind: e.target.value as RoomKind })}
                                >
                                  {ROOM_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                              </Field>
                              <Field label="How many">
                                <NumberInput
                                  value={g.count} min={0} max={400} ariaLabel="How many"
                                  onChange={n => updateGroup(g.id, { count: n })}
                                />
                              </Field>
                              <Field label="Seats each">
                                <NumberInput
                                  value={g.capacity} min={1} max={2000} ariaLabel="Seats each"
                                  onChange={n => updateGroup(g.id, { capacity: n })}
                                />
                              </Field>
                              <Field label="Turnover">
                                <NumberInput
                                  value={g.turnoverMinutes} min={0} max={180} step={5} suffix="min"
                                  ariaLabel="Turnover"
                                  onChange={n => updateGroup(g.id, { turnoverMinutes: n })}
                                />
                              </Field>
                              <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                                <button
                                  className="btn btn-ghost"
                                  aria-expanded={openFeatures === g.id}
                                  title="Room capabilities"
                                  onClick={() => setOpenFeatures(openFeatures === g.id ? null : g.id)}
                                >
                                  {g.features.length} ▾
                                </button>
                                <button
                                  className="btn btn-danger-soft"
                                  title="Remove this room type"
                                  onClick={() => removeGroup(g.id)}
                                >×</button>
                              </div>
                            </div>

                            {openFeatures === g.id && (
                              <div style={{ padding: '0 0 14px' }}>
                                <p className="field-hint" style={{ marginBottom: 8 }}>
                                  {specialisationById(g.specialisation)?.hint
                                    ?? 'Only tick what a course could actually require.'}
                                  {' '}A course asking for something no room has is refused with that
                                  reason, rather than placed wrongly.
                                </p>
                                <div className="feature-grid">
                                  {FEATURE_PRESETS.map(f => {
                                    const on = g.features.includes(f.key)
                                    return (
                                      <button
                                        key={f.key}
                                        type="button"
                                        aria-pressed={on}
                                        title={f.hint}
                                        className={`feature-chip ${on ? 'on' : ''}`}
                                        onClick={() => updateGroup(g.id, {
                                          features: on
                                            ? g.features.filter(x => x !== f.key)
                                            : [...g.features, f.key],
                                        })}
                                      >{f.label}</button>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 14 }}>
          <button className="btn btn-soft" onClick={() => patch({
            buildings: [...config.buildings, {
              id: nextId('b'), name: 'New block', campus: config.campuses[0]?.id ?? 'main',
              walkMinutes: 8, floors: 2, hasElevator: true, accessible: true,
            }],
          })}>+ Add building</button>
        </div>
      </Section>
    </>
  )
}


function StepFaculty({ config, patch }: StepProps) {
  const f = config.faculty
  const set = (p: Partial<typeof f>) => patch({ faculty: { ...f, ...p } })
  const mixSum = Object.values(f.mix).reduce((a, b) => a + b, 0)

  return (
    <Section title="Faculty" hint="Headcount and the legal caps of constraints 11–30">
      <div className="card card-pad">
        <div className="field-grid">
          <Field label="Total teaching staff"><NumberInput value={f.total} min={1} max={5000} onChange={n => set({ total: n })} /></Field>
          <Field label="Max hours per day" hint={HELP.maxPerDay}>
            <NumberInput value={f.maxPerDay} min={1} max={12} suffix="h" onChange={n => set({ maxPerDay: n })} />
          </Field>
          <Field label="Max hours per week" hint={HELP.maxPerWeek}>
            <NumberInput value={f.maxPerWeek} min={1} max={40} suffix="h" onChange={n => set({ maxPerWeek: n })} />
          </Field>
          <Field label="Adjunct weekly cap" hint={HELP.adjunctMaxPerWeek}>
            <NumberInput value={f.adjunctMaxPerWeek} min={1} max={40} suffix="h" onChange={n => set({ adjunctMaxPerWeek: n })} />
          </Field>
          <Field label="TA weekly cap" hint={HELP.taMaxPerWeek}>
            <NumberInput value={f.taMaxPerWeek} min={1} max={40} suffix="h" onChange={n => set({ taMaxPerWeek: n })} />
          </Field>
          <Field label="Courses each can teach (min)" hint={HELP.qualifications}>
            <NumberInput value={f.qualificationsMin} min={1} max={20} onChange={n => set({ qualificationsMin: n })} />
          </Field>
          <Field label="Courses each can teach (max)">
            <NumberInput value={f.qualificationsMax} min={1} max={20} onChange={n => set({ qualificationsMax: n })} />
          </Field>
          <Field label="With a research day" hint={HELP.researchDayShare}>
            <NumberInput value={f.researchDayShare} min={0} max={80} suffix="%" onChange={n => set({ researchDayShare: n })} />
          </Field>
          <Field label="On sabbatical" hint={HELP.sabbaticalShare}>
            <NumberInput value={f.sabbaticalShare} min={0} max={40} suffix="%" onChange={n => set({ sabbaticalShare: n })} />
          </Field>
          <Field label="Needing accessible rooms" hint={HELP.accessibilityShare}>
            <NumberInput value={f.accessibilityShare} min={0} max={50} suffix="%" onChange={n => set({ accessibilityShare: n })} />
          </Field>
        </div>

        <div className="divider" />
        <div className="spread" style={{ marginBottom: 4 }}>
          <span className="field-label">Rank mix</span>
          <Pill tone={mixSum === 100 ? 'ok' : 'warn'}>{mixSum}%</Pill>
        </div>
        <p className="field-hint" style={{ marginBottom: 12 }}>{HELP.rankMix}</p>
        <div className="field-grid">
          {([
            ['professor', 'Professor'], ['associate', 'Associate professor'],
            ['assistant', 'Assistant professor'], ['adjunct', 'Adjunct'],
            ['visiting', 'Visiting'], ['ta', 'Teaching assistant'],
          ] as const).map(([k, label]) => (
            <Field key={k} label={label}>
              <NumberInput value={f.mix[k]} min={0} max={100} suffix="%" onChange={n => set({ mix: { ...f.mix, [k]: n } })} />
            </Field>
          ))}
        </div>
      </div>
    </Section>
  )
}

function StepReview() {
  const { summary, config } = useApp()
  const capacity = summary.facultyTotal * config.faculty.maxPerWeek

  return (
    <Section title="Feasibility review" hint="Checked before a single session is placed">
      <div className="stack" style={{ gap: 14 }}>
        {summary.errors.length === 0 && summary.warnings.length === 0 && (
          <Callout tone="ok" title="Nothing structurally blocks this configuration">
            Demand fits the rooms and the staff you have described. Generate to see where the
            soft constraints land.
          </Callout>
        )}
        {summary.errors.map((e, i) => (
          <Callout key={i} tone="danger" title="Blocking">{e}</Callout>
        ))}
        {summary.warnings.map((w, i) => (
          <Callout key={i} tone="warn" title="Worth knowing">{w}</Callout>
        ))}

        <div className="grid grid-4">
          <div className="card stat">
            <span className="stat-label">Weekly demand</span>
            <span className="stat-value tnum">{summary.demand}</span>
            <span className="stat-note">sessions to place</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Room supply</span>
            <span className="stat-value tnum">{summary.roomSlotsPerWeek}</span>
            <span className="stat-note">room-slots per week</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Teaching supply</span>
            <span className="stat-value tnum">{capacity}</span>
            <span className="stat-note">staff-hours per week</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Room pressure</span>
            <span className="stat-value tnum">
              {Number.isFinite(summary.pressure) ? `${Math.round(summary.pressure * 100)}%` : '—'}
            </span>
            <span className={`stat-note ${summary.pressure > 0.85 ? 'bad' : 'good'}`}>
              {summary.pressure > 1 ? 'over capacity' : summary.pressure > 0.85 ? 'tight' : 'comfortable'}
            </span>
          </div>
        </div>
      </div>
    </Section>
  )
}


/**
 * What the academic calendar has already done to the week being configured.
 *
 * The wizard is where somebody decides the shape of the teaching week, and it
 * is the wrong place to discover afterwards that Friday only happens eleven
 * times. This is a summary, not a second editor — the entries themselves live
 * on the Calendar screen.
 */
function CalendarImpactStrip() {
  const { institution, config, summary } = useApp()
  const cal = institution.calendar
  const events = config.calendar.events ?? []

  if (!cal.dated) {
    return (
      <div style={{ marginTop: 16 }}>
        <Callout tone="info" title="No term dates set">
          Set a start and end date to see how many times each weekday actually occurs.
          Until then the schedule is counted in whole weeks.
        </Callout>
      </div>
    )
  }

  const best = Math.max(1, ...cal.impact.map(i => i.totalDates))

  return (
    <div className="panel" style={{ marginTop: 18, padding: '14px 16px' }}>
      <div className="spread" style={{ marginBottom: 10 }}>
        <span className="field-label">Teaching dates in {prettyRange(cal.termStart, cal.termEnd)}</span>
        <span className="small muted tnum">
          {cal.teachingDates} dates · {events.length} calendar entr{events.length === 1 ? 'y' : 'ies'}
        </span>
      </div>

      {cal.impact.map(row => (
        <div key={row.day} className="attrition-row">
          <span className="small" style={{ fontWeight: 700 }}>{DAY_NAMES[row.day]}</span>
          <Meter
            value={row.totalDates > 0 ? row.teachingDates / best : 0}
            tone={row.lostDates > 0 ? 'var(--warn)' : 'var(--ok)'}
          />
          <span className="small muted tnum" style={{ textAlign: 'right' }}>
            {row.teachingDates} of {row.totalDates}
            {row.lostDates > 0 && ` · −${row.lostDates}`}
          </span>
        </div>
      ))}

      {summary.blackoutSlots > 0 && (
        <p className="field-hint" style={{ marginTop: 10 }}>
          A further {summary.blackoutSlots} slot{summary.blackoutSlots === 1 ? '' : 's'} a week
          {' '}{summary.blackoutSlots === 1 ? 'is' : 'are'} held by repeating institution events.
        </p>
      )}
    </div>
  )
}

/**
 * Per-year section control.
 *
 * The programme carries a default number of sections, but real intakes are
 * uneven — a department can run three first-year sections and one final-year.
 * Setting a year here overrides the default for that year only.
 */
function SectionOverrides({ program }: { program: ProgramConfig }) {
  const { config, setSections } = useApp()
  const overrides = config.overrides?.sections ?? {}

  return (
    <div className="panel" style={{ marginTop: 14, padding: '12px 16px' }}>
      <div className="spread" style={{ marginBottom: 10 }}>
        <span className="field-label">Sections by year</span>
        <span className="small muted">overrides the programme default</span>
      </div>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
        {Array.from({ length: Math.max(1, program.years) }, (_, k) => k + 1).map(year => {
          const key = `${program.id}:${year}`
          const value = overrides[key] ?? program.sectionsPerYear
          return (
            <label key={year} className="row" style={{ gap: 8 }}>
              <span className="small muted" style={{ minWidth: 46 }}>Year {year}</span>
              <span style={{ width: 92 }}>
                <NumberInput
                  value={value}
                  min={0}
                  max={30}
                  ariaLabel={`Sections in year ${year}`}
                  onChange={n => setSections(program.id, year, n)}
                />
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
