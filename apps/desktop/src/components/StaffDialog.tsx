import { useMemo, useState } from 'react'
import { Dialog, DialogSection } from './Dialog'
import { Combobox, Field, NumberInput, Switch, TextInput } from './ui'
import { useApp } from '../store'
import { HELP } from '../content/help'
import {
  COURSE_KINDS,
  DAY_NAMES,
  DAY_SHORT,
  EMPLOYMENT_TYPES,
  STAFF_RANKS,
  SELECTABLE_ROOM_KINDS,
  type CourseKind,
  type EmploymentType,
  type StaffRank,
  type RoomKind,
} from '@aula/core/data/model'
import { PREFERRED_SHIFTS, type StaffRecord } from '@aula/core/data/records'
import { loadForRank } from '@aula/core/data/config'

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
/**
 * Add or remove a value from a list, immutably.
 *
 * Declared at module scope rather than inside the component: it closes over
 * nothing, so re-creating it on every render only gives React a new identity to
 * compare.
 */
const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter(x => x !== value) : [...list, value]

export function StaffDialog(props: {
  /** the record being edited, or a blank one for a new member of staff */
  initial: StaffRecord
  mode: 'add' | 'edit'
  onSave: (rec: StaffRecord) => void
  onClose: () => void
}) {
  const { config, institution } = useApp()
  const [rec, setRec] = useState<StaffRecord>(props.initial)
  const [showAllCourses, setShowAllCourses] = useState(false)
  const [touched, setTouched] = useState(false)

  /**
   * A field edit, including clearing an optional one.
   *
   * `Partial<StaffRecord>` cannot express this under
   * `exactOptionalPropertyTypes`: it keeps every key optional but still
   * forbids an explicit `undefined`, so "no home building" would be
   * unrepresentable. Spreading an explicit `undefined` over the record is
   * exactly the clearing semantics the form needs.
   */
  type StaffPatch = { [K in keyof StaffRecord]?: StaffRecord[K] | undefined }
  const set = (patch: StaffPatch) =>
    setRec(current => {
      const next: StaffRecord = { ...current }
      for (const [key, value] of Object.entries(patch)) {
        // Clearing removes the key rather than setting it to `undefined`, which
        // is what the record contract means by an absent optional field.
        if (value === undefined) delete next[key as keyof StaffRecord]
        else Object.assign(next, { [key]: value })
      }
      return next
    })
  const grid = institution.grid

  /* Courses they could be given. Cross-department teaching is normal, so the
     default view is their own department with everything else one tick away. */
  const deptId = institution.departments.find(d => d.code === rec.dept)?.id
  const courses = useMemo(() => {
    const list = showAllCourses
      ? institution.courses
      : institution.courses.filter(c => c.deptId === deptId)
    return list.toSorted((a, b) => a.code.localeCompare(b.code))
  }, [institution.courses, deptId, showAllCourses])

  const nameError = rec.name.trim() === '' ? 'Give this person a name.' : ''
  const capError =
    rec.maxPerDay > rec.maxPerWeek
      ? 'The daily cap is above the weekly one, so the weekly cap could never be reached.'
      : ''
  const qualError =
    rec.courseIds.length === 0 && rec.secondaryCourseIds.length === 0
      ? 'Tick at least one course, or the scheduler can never give this person a class.'
      : ''
  const error = nameError || capError || qualError

  const save = () => {
    setTouched(true)
    if (error) return
    props.onSave({
      ...rec,
      name: rec.name.trim(),
      staffCode: rec.staffCode.trim(),
      email: rec.email.trim(),
      unavailableDays: rec.unavailableDays.toSorted((a, b) => a - b),
      availableDays: rec.availableDays.toSorted((a, b) => a - b),
    })
  }

  const toggleSlot = (day: number, slot: number) => {
    const key = `${day}:${slot}`
    set({ blockedSlots: toggle(rec.blockedSlots, key) })
  }

  return (
    <Dialog
      size="wide"
      title={
        props.mode === 'add' ? 'Add teaching staff' : `Edit ${props.initial.name || 'staff member'}`
      }
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
          <Field
            label="Full name"
            wide
            hint="The name printed on every student and staff timetable."
          >
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
          <Field
            label="Department"
            hint="Their home department. They can still be given another department's courses below."
          >
            <Combobox
              value={rec.dept}
              ariaLabel="Department"
              options={config.departments.map(d => ({
                value: d.code,
                label: d.code,
                hint: d.name,
              }))}
              onChange={v => set({ dept: v })}
            />
          </Field>
          <Field
            label="Designation"
            hint="Professor down to teaching assistant. Seniority breaks ties for the best hours."
          >
            <Combobox
              value={rec.rank}
              ariaLabel="Designation"
              options={STAFF_RANKS.map(r => ({
                value: r,
                label: r,
                hint: `${loadForRank(config.staff, r).min}-${loadForRank(config.staff, r).max} h/wk`,
              }))}
              onChange={v => set({ rank: v as StaffRank })}
            />
          </Field>
          <Field label="Employment type" hint={HELP.employment}>
            <Combobox
              value={rec.employment}
              ariaLabel="Employment type"
              options={EMPLOYMENT_TYPES.map(t => ({ value: t, label: t }))}
              onChange={v => set({ employment: v as EmploymentType })}
            />
          </Field>
        </div>
      </DialogSection>

      {/* ---------------- 2. teaching capability ---------------- */}
      <DialogSection
        title="Teaching capability"
        hint="What this person may be given. These lists are the first thing the solver applies — anything not permitted here is never even considered, which is also what keeps the search fast."
      >
        <div className="field-label" style={{ marginBottom: 4 }}>
          Eligible programmes
        </div>
        <p className="field-hint" style={{ marginBottom: 10 }}>
          {HELP.eligiblePrograms}
        </p>
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
              >
                {p.code}
              </button>
            )
          })}
          {config.programs.length === 0 && (
            <span className="small muted">No programmes yet — add one in Setup.</span>
          )}
        </div>

        <div className="field-label" style={{ marginBottom: 4 }}>
          Session types they may run
        </div>
        <p className="field-hint" style={{ marginBottom: 10 }}>
          {HELP.sessionKinds}
        </p>
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
              >
                {k}
              </button>
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
        <p className="field-hint" style={{ marginBottom: 10 }}>
          {HELP.primaryExpertise}
        </p>
        <div className="feature-grid chip-scroll" style={{ marginBottom: 16 }}>
          {courses.length === 0 && (
            <span className="small muted">No courses in this department yet.</span>
          )}
          {courses.map(c => {
            const on = rec.courseIds.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                title={`${c.name} · year ${c.year} · ${c.kind}`}
                className={`feature-chip ${on ? 'on' : ''}`}
                onClick={() =>
                  set({
                    courseIds: toggle(rec.courseIds, c.id),
                    // a course cannot be both first choice and fallback
                    secondaryCourseIds: rec.secondaryCourseIds.filter(id => id !== c.id),
                  })
                }
              >
                {c.code}
              </button>
            )
          })}
        </div>

        <div className="field-label" style={{ marginBottom: 4 }}>
          Secondary / cover expertise
        </div>
        <p className="field-hint" style={{ marginBottom: 10 }}>
          {HELP.secondaryExpertise}
        </p>
        <div className="feature-grid chip-scroll" style={{ marginBottom: 16 }}>
          {courses
            .filter(c => !rec.courseIds.includes(c.id))
            .map(c => {
              const on = rec.secondaryCourseIds.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  title={`${c.name} · year ${c.year} · ${c.kind}`}
                  className={`feature-chip ${on ? 'on' : ''}`}
                  onClick={() => set({ secondaryCourseIds: toggle(rec.secondaryCourseIds, c.id) })}
                >
                  {c.code}
                </button>
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
            <NumberInput
              value={rec.maxPerDay}
              min={1}
              max={12}
              suffix="h"
              onChange={n => set({ maxPerDay: n })}
            />
          </Field>
          <Field label="Max hours per week" hint={HELP.maxPerWeek}>
            <NumberInput
              value={rec.maxPerWeek}
              min={1}
              max={40}
              suffix="h"
              onChange={n => set({ maxPerWeek: n })}
            />
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
            <Combobox
              value={rec.preferredShift}
              ariaLabel="Preferred shift"
              options={PREFERRED_SHIFTS.map(o => ({ value: o.id, label: o.label }))}
              onChange={v => set({ preferredShift: v as StaffRecord['preferredShift'] })}
            />
          </Field>
        </div>

        <div className="divider" style={{ margin: '16px 0' }} />

        <div className="field-label" style={{ marginBottom: 4 }}>
          Days on campus
        </div>
        <p className="field-hint" style={{ marginBottom: 10 }}>
          {HELP.availableDays}
        </p>
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
              >
                {DAY_SHORT[d]}
              </button>
            )
          })}
          <span className="small muted" style={{ marginLeft: 6 }}>
            {rec.availableDays.length === 0
              ? 'None ticked — available all week'
              : `On campus ${rec.availableDays.length} day${rec.availableDays.length === 1 ? '' : 's'}`}
          </span>
        </div>

        <div className="field-label" style={{ marginBottom: 4 }}>
          Days they never teach
        </div>
        <p className="field-hint" style={{ marginBottom: 10 }}>
          {HELP.researchDayShare}
        </p>
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
              >
                {DAY_SHORT[d]}
              </button>
            )
          })}
        </div>

        <div className="field-label" style={{ marginBottom: 4 }}>
          Blocked periods
        </div>
        <p className="field-hint" style={{ marginBottom: 10 }}>
          {HELP.blockedSlots}
        </p>
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
            <Combobox
              value={rec.homeBuildingId ?? ''}
              ariaLabel="Home building"
              options={[
                { value: '', label: 'No anchor' },
                ...config.buildings.map(b => ({ value: b.id, label: b.name })),
              ]}
              onChange={v => set(v === '' ? { homeBuildingId: undefined } : { homeBuildingId: v })}
            />
          </Field>
          <Field label="Preferred room type" hint={HELP.preferredRoomKind}>
            <Combobox
              value={rec.preferredRoomKind ?? ''}
              ariaLabel="Preferred room type"
              options={[
                { value: '', label: 'No preference' },
                ...SELECTABLE_ROOM_KINDS.map(k => ({ value: k, label: k })),
              ]}
              onChange={v =>
                set(
                  v === ''
                    ? { preferredRoomKind: undefined }
                    : { preferredRoomKind: v as RoomKind },
                )
              }
            />
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
          <label className="row" style={{ gap: 10 }}>
            <Switch
              on={rec.active !== false}
              label="Currently on the staff"
              onChange={() => set({ active: rec.active === false })}
            />
            <span className="small">
              Currently on the staff — turn off when somebody leaves, rather than deleting them, so
              the timetables they already appear on still resolve
            </span>
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
