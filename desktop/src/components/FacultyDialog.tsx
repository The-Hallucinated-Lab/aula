import { useMemo, useState } from 'react'
import { Dialog, DialogSection } from './Dialog'
import { Field, NumberInput, Switch, TextInput } from './ui'
import { useApp } from '../store'
import { HELP } from '../data/help'
import {
  COURSE_KINDS, DAY_NAMES, DAY_SHORT, EMPLOYMENT_TYPES, FACULTY_RANKS, ROOM_KINDS,
  type CourseKind, type EmploymentType, type FacultyRank, type RoomKind,
} from '../data/model'
import { PREFERRED_SHIFTS, type FacultyRecord } from '../data/records'

/**
 * Staff intake.
 *
 * Adding a person used to drop a placeholder row into the list and leave the
 * administrator to find and fill it. The scheduler cannot do anything sensible
 * with a nameless staff member qualified for nothing, so the record was
 * inert until somebody remembered to go back to it.
 *
 * This collects the whole record before it exists, in the four groups an
 * institution actually keeps: who they are, what they can teach, what their
 * contract and availability allow, and where they are based. Every field
 * reaches the solver; the hint under each one says how.
 */
export function FacultyDialog(props: {
  /** the record being edited, or a blank one for a new member of staff */
  initial: FacultyRecord
  mode: 'add' | 'edit'
  onSave: (rec: FacultyRecord) => void
  onClose: () => void
}) {
  const { config, institution } = useApp()
  const [rec, setRec] = useState<FacultyRecord>(props.initial)
  const [showAllCourses, setShowAllCourses] = useState(false)
  const [touched, setTouched] = useState(false)

  const set = (p: Partial<FacultyRecord>) => setRec(r => ({ ...r, ...p }))
  const grid = institution.grid

  /* Courses they could be given. Cross-department teaching is normal, so the
     default view is their own department with everything else one tick away. */
  const deptId = institution.departments.find(d => d.code === rec.dept)?.id
  const courses = useMemo(() => {
    const list = showAllCourses
      ? institution.courses
      : institution.courses.filter(c => c.deptId === deptId)
    return [...list].sort((a, b) => a.code.localeCompare(b.code))
  }, [institution.courses, deptId, showAllCourses])

  const nameError = rec.name.trim() === '' ? 'Give this person a name.' : ''
  const capError = rec.maxPerDay > rec.maxPerWeek
    ? 'The daily cap is above the weekly one, so the weekly cap could never be reached.'
    : ''
  const qualError = rec.courseIds.length === 0 && rec.secondaryCourseIds.length === 0
    ? 'Tick at least one course, or the scheduler can never give this person a class.'
    : ''
  const error = nameError || capError || qualError

  const toggle = <T,>(list: T[], value: T): T[] =>
    (list.includes(value) ? list.filter(x => x !== value) : [...list, value])

  const save = () => {
    setTouched(true)
    if (error) return
    props.onSave({
      ...rec,
      name: rec.name.trim(),
      staffCode: rec.staffCode.trim(),
      email: rec.email.trim(),
      unavailableDays: [...rec.unavailableDays].sort((a, b) => a - b),
      availableDays: [...rec.availableDays].sort((a, b) => a - b),
    })
  }

  const toggleSlot = (day: number, slot: number) => {
    const key = `${day}:${slot}`
    set({ blockedSlots: toggle(rec.blockedSlots, key) })
  }

  return (
    <Dialog
      size="wide"
      title={props.mode === 'add' ? 'Add teaching staff' : `Edit ${props.initial.name || 'staff member'}`}
      subtitle="Everything here is read by the scheduler. Leave a capability list empty to mean “no restriction”, not “nothing”."
      onClose={props.onClose}
      footer={
        <>
          {touched && error && <span className="dialog-error">⊘ {error}</span>}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginLeft: touched && error ? 0 : 'auto' }}
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            {props.mode === 'add' ? 'Add staff member' : 'Save changes'}
          </button>
        </>
      }
    >
      {/* ---------------- 1. identity & affiliation ---------------- */}
      <DialogSection
        title="Identity & affiliation"
        hint="Where this person sits on the org chart. Designation decides which weekly cap applies and who gets first pick of prime hours."
      >
        <div className="field-grid">
          <Field label="Full name" wide hint="The name printed on every student and staff timetable.">
            <TextInput
              value={rec.name}
              ariaLabel="Full name"
              placeholder="Dr. Ananya Sharma"
              onChange={v => set({ name: v })}
            />
          </Field>
          <Field label="Staff ID" hint={HELP.staffCode}>
            <TextInput
              value={rec.staffCode}
              ariaLabel="Staff ID"
              placeholder={`${rec.dept}-000`}
              onChange={v => set({ staffCode: v })}
            />
          </Field>
          <Field label="Email" hint="Optional. Carried on exports so a registrar can reach them.">
            <TextInput
              value={rec.email}
              ariaLabel="Email"
              placeholder="name@institute.edu"
              onChange={v => set({ email: v })}
            />
          </Field>
          <Field label="Department" hint="Their home department. They can still be given another department's courses below.">
            <select
              className="select"
              value={rec.dept}
              aria-label="Department"
              onChange={e => set({ dept: e.target.value })}
            >
              {config.departments.map(d => (
                <option key={d.code} value={d.code}>{d.code} — {d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Designation" hint="Professor down to teaching assistant. Seniority breaks ties for the best hours.">
            <select
              className="select"
              value={rec.rank}
              aria-label="Designation"
              onChange={e => set({ rank: e.target.value as FacultyRank })}
            >
              {FACULTY_RANKS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Employment type" hint={HELP.employment}>
            <select
              className="select"
              value={rec.employment}
              aria-label="Employment type"
              onChange={e => set({ employment: e.target.value as EmploymentType })}
            >
              {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>
      </DialogSection>

      {/* ---------------- 2. teaching capability ---------------- */}
      <DialogSection
        title="Teaching capability"
        hint="What this person may be given. These lists are the first thing the solver applies — anything not permitted here is never even considered, which is also what keeps the search fast."
      >
        <div className="field-label" style={{ marginBottom: 4 }}>Eligible programmes</div>
        <p className="field-hint" style={{ marginBottom: 10 }}>{HELP.eligiblePrograms}</p>
        <div className="feature-grid" style={{ marginBottom: 16 }}>
          {config.programs.map(p => {
            const on = rec.programIds.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                title={p.name}
                className={`feature-chip ${on ? 'on' : ''}`}
                onClick={() => set({ programIds: toggle(rec.programIds, p.id) })}
              >{p.code}</button>
            )
          })}
          {config.programs.length === 0 && (
            <span className="small muted">No programmes yet — add one in Setup.</span>
          )}
        </div>

        <div className="field-label" style={{ marginBottom: 4 }}>Session types they may run</div>
        <p className="field-hint" style={{ marginBottom: 10 }}>{HELP.sessionKinds}</p>
        <div className="feature-grid" style={{ marginBottom: 16 }}>
          {COURSE_KINDS.map(k => {
            const on = rec.sessionKinds.includes(k)
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                className={`feature-chip ${on ? 'on' : ''}`}
                onClick={() => set({ sessionKinds: toggle(rec.sessionKinds, k as CourseKind) })}
              >{k}</button>
            )
          })}
        </div>

        <div className="spread" style={{ marginBottom: 4 }}>
          <span className="field-label">Primary subject expertise</span>
          <label className="row small muted" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={showAllCourses}
              onChange={() => setShowAllCourses(v => !v)}
            />
            Show every department's courses
          </label>
        </div>
        <p className="field-hint" style={{ marginBottom: 10 }}>{HELP.primaryExpertise}</p>
        <div className="feature-grid chip-scroll" style={{ marginBottom: 16 }}>
          {courses.length === 0 && <span className="small muted">No courses in this department yet.</span>}
          {courses.map(c => {
            const on = rec.courseIds.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                title={`${c.name} · year ${c.year} · ${c.kind}`}
                className={`feature-chip ${on ? 'on' : ''}`}
                onClick={() => set({
                  courseIds: toggle(rec.courseIds, c.id),
                  // a course cannot be both first choice and fallback
                  secondaryCourseIds: rec.secondaryCourseIds.filter(id => id !== c.id),
                })}
              >{c.code}</button>
            )
          })}
        </div>

        <div className="field-label" style={{ marginBottom: 4 }}>Secondary / cover expertise</div>
        <p className="field-hint" style={{ marginBottom: 10 }}>{HELP.secondaryExpertise}</p>
        <div className="feature-grid chip-scroll" style={{ marginBottom: 16 }}>
          {courses.filter(c => !rec.courseIds.includes(c.id)).map(c => {
            const on = rec.secondaryCourseIds.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                title={`${c.name} · year ${c.year} · ${c.kind}`}
                className={`feature-chip ${on ? 'on' : ''}`}
                onClick={() => set({ secondaryCourseIds: toggle(rec.secondaryCourseIds, c.id) })}
              >{c.code}</button>
            )
          })}
        </div>

        <div className="field-grid">
          <Field label="Largest group they will take" hint={HELP.maxAudience}>
            <NumberInput
              value={rec.maxAudience}
              min={0}
              max={2000}
              suffix="students"
              ariaLabel="Largest group"
              onChange={n => set({ maxAudience: n })}
            />
          </Field>
        </div>
      </DialogSection>

      {/* ---------------- 3. workload & availability ---------------- */}
      <DialogSection
        title="Workload & availability"
        hint="The hard ceilings that stop the schedule overloading one person, and the hours they are simply not there."
      >
        <div className="field-grid">
          <Field label="Max hours per day" hint={HELP.maxPerDay}>
            <NumberInput value={rec.maxPerDay} min={1} max={12} suffix="h" onChange={n => set({ maxPerDay: n })} />
          </Field>
          <Field label="Max hours per week" hint={HELP.maxPerWeek}>
            <NumberInput value={rec.maxPerWeek} min={1} max={40} suffix="h" onChange={n => set({ maxPerWeek: n })} />
          </Field>
          <Field label="Max consecutive periods" hint={HELP.maxConsecutive}>
            <NumberInput
              value={rec.maxConsecutive}
              min={0}
              max={12}
              ariaLabel="Max consecutive periods"
              onChange={n => set({ maxConsecutive: n })}
            />
          </Field>
          <Field label="Preferred shift" hint={HELP.preferredShift}>
            <select
              className="select"
              value={rec.preferredShift}
              aria-label="Preferred shift"
              onChange={e => set({ preferredShift: e.target.value as FacultyRecord['preferredShift'] })}
            >
              {PREFERRED_SHIFTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="divider" style={{ margin: '16px 0' }} />

        <div className="field-label" style={{ marginBottom: 4 }}>Days on campus</div>
        <p className="field-hint" style={{ marginBottom: 10 }}>{HELP.availableDays}</p>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {config.calendar.workingDays.map(d => {
            const on = rec.availableDays.includes(d)
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                title={`${DAY_NAMES[d]}: ${on ? 'on campus' : 'not specified'}`}
                className={`day-toggle ${on ? 'on' : ''}`}
                onClick={() => set({ availableDays: toggle(rec.availableDays, d) })}
              >{DAY_SHORT[d]}</button>
            )
          })}
          <span className="small muted" style={{ marginLeft: 6 }}>
            {rec.availableDays.length === 0
              ? 'None ticked — available all week'
              : `On campus ${rec.availableDays.length} day${rec.availableDays.length === 1 ? '' : 's'}`}
          </span>
        </div>

        <div className="field-label" style={{ marginBottom: 4 }}>Days they never teach</div>
        <p className="field-hint" style={{ marginBottom: 10 }}>{HELP.researchDayShare}</p>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {config.calendar.workingDays.map(d => {
            const off = rec.unavailableDays.includes(d)
            return (
              <button
                key={d}
                type="button"
                aria-pressed={off}
                title={`${DAY_NAMES[d]}: ${off ? 'no teaching' : 'available'}`}
                className={`day-toggle ${off ? 'on' : ''}`}
                onClick={() => set({ unavailableDays: toggle(rec.unavailableDays, d) })}
              >{DAY_SHORT[d]}</button>
            )
          })}
        </div>

        <div className="field-label" style={{ marginBottom: 4 }}>Blocked periods</div>
        <p className="field-hint" style={{ marginBottom: 10 }}>{HELP.blockedSlots}</p>
        <div className="avail-grid" style={{ gridTemplateColumns: `56px repeat(${grid.slots}, 1fr)` }}>
          <span />
          {grid.labels.map(l => <span key={l} className="heat-time">{l}</span>)}
          {grid.days.map(day => (
            <BlockRow
              key={day}
              day={day}
              slots={grid.slots}
              wholeDayOff={rec.unavailableDays.includes(day)}
              blocked={rec.blockedSlots}
              onToggle={toggleSlot}
            />
          ))}
        </div>
      </DialogSection>

      {/* ---------------- 4. location & accommodations ---------------- */}
      <DialogSection
        title="Location & accommodations"
        hint="Where this person is based, and anything the rooms they are given must satisfy."
      >
        <div className="field-grid">
          <Field label="Home building" hint={HELP.homeBuilding}>
            <select
              className="select"
              value={rec.homeBuildingId ?? ''}
              aria-label="Home building"
              onChange={e => set({ homeBuildingId: e.target.value || undefined })}
            >
              <option value="">No anchor</option>
              {config.buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Preferred room type" hint={HELP.preferredRoomKind}>
            <select
              className="select"
              value={rec.preferredRoomKind ?? ''}
              aria-label="Preferred room type"
              onChange={e => set({ preferredRoomKind: (e.target.value || undefined) as RoomKind | undefined })}
            >
              <option value="">No preference</option>
              {ROOM_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
        </div>

        <div className="divider" style={{ margin: '16px 0' }} />

        <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
          <label className="row" style={{ gap: 10 }}>
            <Switch
              on={rec.needsAccessibleRoom}
              label="Needs accessible rooms"
              onChange={() => set({ needsAccessibleRoom: !rec.needsAccessibleRoom })}
            />
            <span className="small">Needs step-free, accessible rooms</span>
          </label>
          <label className="row" style={{ gap: 10 }}>
            <Switch
              on={rec.onSabbatical}
              label="On sabbatical"
              onChange={() => set({ onSabbatical: !rec.onSabbatical })}
            />
            <span className="small">On sabbatical — stays on the roster, teaches nothing</span>
          </label>
        </div>
      </DialogSection>
    </Dialog>
  )
}

function BlockRow(props: {
  day: number
  slots: number
  wholeDayOff: boolean
  blocked: string[]
  onToggle: (day: number, slot: number) => void
}) {
  return (
    <>
      <span className="heat-label">{DAY_SHORT[props.day]}</span>
      {Array.from({ length: props.slots }, (_, slot) => {
        const off = props.wholeDayOff || props.blocked.includes(`${props.day}:${slot}`)
        return (
          <button
            key={slot}
            type="button"
            disabled={props.wholeDayOff}
            aria-pressed={off}
            className={`avail-cell ${off ? 'off' : ''}`}
            title={`${DAY_NAMES[props.day]} period ${slot + 1}: ${off ? 'unavailable' : 'available'}`}
            onClick={() => props.onToggle(props.day, slot)}
          />
        )
      })}
    </>
  )
}
