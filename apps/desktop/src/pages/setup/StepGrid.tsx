import { useMemo } from 'react'
import { Callout, Field, NumberInput, Section, TextInput } from '../../components/ui'
import { TWO_SHIFT_PRESET, slotPlan, type ShiftConfig } from '@aula/core/data/config'
import { DAY_SHORT, minutesToLabel } from '@aula/core/data/model'
import { HELP } from '../../content/help'
import { patchAt } from '../../lib/records'
import { nextId, type StepProps } from './steps'

/**
 * The teaching day — working days, hours, slot length, shifts and breaks.
 *
 * This is where a configuration most easily becomes unschedulable, so the step
 * shows the resulting slot grid as the numbers are typed rather than waiting
 * for the solver to refuse.
 */

export function StepGrid({ config, patch }: StepProps) {
  const cal = config.calendar
  const set = (p: Partial<typeof cal>) => patch({ calendar: { ...cal, ...p } })
  const plan = useMemo(() => slotPlan(cal), [cal])
  const perDay = plan.slots.length
  const shortFinal =
    plan.slots.at(-1)?.duration !== undefined && plan.slots.at(-1)?.duration !== cal.slotMinutes

  const setShift = (i: number, s: Partial<ShiftConfig>) =>
    set({ shifts: patchAt(cal.shifts, i, s) })

  return (
    <Section title="Teaching day" hint="The grid every session must land on">
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
                  onClick={() =>
                    set({
                      workingDays: on
                        ? cal.workingDays.filter(x => x !== i)
                        : [...cal.workingDays, i].toSorted((a, b) => a - b),
                    })
                  }
                >
                  {d}
                </button>
              )
            })}
          </div>
        </Field>

        <div className="divider" />

        <div className="field-grid">
          <Field label="Day starts">
            <TextInput type="time" value={cal.dayStart} onChange={v => set({ dayStart: v })} />
          </Field>
          <Field label="Day ends">
            <TextInput type="time" value={cal.dayEnd} onChange={v => set({ dayEnd: v })} />
          </Field>
          <Field label="Period length">
            <NumberInput
              value={cal.slotMinutes}
              min={15}
              max={240}
              step={5}
              suffix="min"
              onChange={n => set({ slotMinutes: n })}
            />
          </Field>
          <Field label="Passing time" hint={HELP.passingMinutes}>
            <NumberInput
              value={cal.passingMinutes}
              min={0}
              max={60}
              step={5}
              suffix="min"
              onChange={n => set({ passingMinutes: n })}
            />
          </Field>
          <Field label="Lunch starts">
            <TextInput type="time" value={cal.lunchStart} onChange={v => set({ lunchStart: v })} />
          </Field>
          <Field label="Lunch length">
            <NumberInput
              value={cal.lunchMinutes}
              min={0}
              max={180}
              step={15}
              suffix="min"
              onChange={n => set({ lunchMinutes: n })}
            />
          </Field>
          <Field
            label="Shortest final period"
            hint="A day rarely divides evenly into whole periods. 0 drops the leftover; anything higher keeps a shorter last period rather than losing it, and the day still ends when you said."
          >
            <NumberInput
              value={cal.minFinalSlotMinutes}
              min={0}
              max={cal.slotMinutes}
              step={5}
              suffix="min"
              onChange={n => set({ minFinalSlotMinutes: n })}
            />
          </Field>
        </div>

        <div className="divider" />

        <div className="spread" style={{ marginBottom: 4 }}>
          <span className="field-label">Shifts</span>
          {cal.shifts.length === 0 && (
            <button
              className="btn btn-soft"
              onClick={() => set({ shifts: TWO_SHIFT_PRESET.map(s => ({ ...s })) })}
            >
              Use morning / evening shifts
            </button>
          )}
        </div>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          A section belongs to one shift and is never scheduled outside it. With no shifts defined,
          the whole day is available to everyone.
        </p>

        {cal.shifts.length === 0 ? (
          <Callout tone="info" title="One shift — the whole day">
            Every section may be taught at any hour of the teaching day.
          </Callout>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 130 }}>Starts</th>
                  <th style={{ width: 130 }}>Ends</th>
                  <th style={{ width: 70 }}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {cal.shifts.map((s, i) => (
                  <tr key={s.id}>
                    <td>
                      <TextInput
                        value={s.name}
                        ariaLabel="Shift name"
                        onChange={v => setShift(i, { name: v })}
                      />
                    </td>
                    <td>
                      <TextInput
                        type="time"
                        value={s.start}
                        ariaLabel="Shift starts"
                        onChange={v => setShift(i, { start: v })}
                      />
                    </td>
                    <td>
                      <TextInput
                        type="time"
                        value={s.end}
                        ariaLabel="Shift ends"
                        onChange={v => setShift(i, { end: v })}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-danger-soft"
                        onClick={() => set({ shifts: cal.shifts.filter((_, x) => x !== i) })}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card-pad">
              <button
                className="btn btn-soft"
                onClick={() =>
                  set({
                    shifts: [
                      ...cal.shifts,
                      {
                        id: nextId('shift'),
                        name: 'New shift',
                        start: cal.dayStart,
                        end: cal.dayEnd,
                      },
                    ],
                  })
                }
              >
                + Add shift
              </button>
            </div>
          </div>
        )}

        <div className="divider" />

        <div className="small muted" style={{ marginBottom: 8 }}>
          {perDay} period{perDay === 1 ? '' : 's'} per day &times; {cal.workingDays.length} day
          {cal.workingDays.length === 1 ? '' : 's'} ={' '}
          <b className="tnum">{perDay * cal.workingDays.length}</b> teaching periods a week
          {shortFinal && (
            <>
              {' '}
              &middot; the last is <b className="tnum">{plan.durations[perDay - 1]}</b> min so the
              day ends at {cal.dayEnd}
            </>
          )}
        </div>
        <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
          {plan.slots.slice(0, 16).map(slot => (
            <span
              key={slot.start}
              className={`chip mono ${slot.duration === cal.slotMinutes ? 'chip-soft' : 'chip-warn'}`}
            >
              {minutesToLabel(slot.start)}&ndash;{minutesToLabel(slot.end)}
            </span>
          ))}
          {perDay > 16 && <span className="small muted">+{perDay - 16} more</span>}
        </div>
      </div>
    </Section>
  )
}

/**
 * Term dates. Revisited every session, which is why they are no longer beside
 * the slot grid.
 */
