import { useMemo, useState } from 'react'
import { useApp } from '../../store'
import { Section, SERIES } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { DAY_SHORT } from '@aula/core/data/model'
import { blankStaff, staffRecordsFrom, type StaffRecord } from '@aula/core/data/records'
import { StaffDialog } from '../../components/StaffDialog'
import { OwnershipBar } from './OwnershipBar'

/**
 * The roster.
 *
 * Grouped by department, because that is how a timetable office thinks about
 * staffing and how the workload ceilings are set.
 */

export function StaffTab() {
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
