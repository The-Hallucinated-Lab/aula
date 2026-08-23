import { useMemo, useState } from 'react'
import { useApp } from '../../store'
import {
  Callout,
  Combobox,
  Field,
  NumberInput,
  Segmented,
  Switch,
  TextInput,
} from '../../components/ui'
import { useToast } from '../../components/Toast'
import {
  COURSE_KINDS,
  SELECTABLE_ROOM_KINDS,
  type CourseKind,
  type RoomKind,
} from '@aula/core/data/model'
import { FEATURE_PRESETS, courseRecordsFrom, type CourseRecord } from '@aula/core/data/records'
import { HELP } from '../../content/help'
import { OwnershipBar } from './OwnershipBar'

/**
 * The curriculum.
 *
 * Weekly meetings, block length and the kind of room a course needs are what
 * the solver reads; everything else on this screen is for the reader.
 */

export function CoursesTab() {
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
