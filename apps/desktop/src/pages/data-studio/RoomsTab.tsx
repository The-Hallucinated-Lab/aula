import { useMemo, useState } from 'react'
import { useApp } from '../../store'
import {
  Combobox,
  Field,
  Meter,
  NumberInput,
  Section,
  Switch,
  TextInput,
} from '../../components/ui'
import { useToast } from '../../components/Toast'
import { DAY_NAMES, DAY_SHORT, SELECTABLE_ROOM_KINDS, type RoomKind } from '@aula/core/data/model'
import {
  FEATURE_PRESETS,
  ROOM_SPECIALISATIONS,
  roomRecordsFrom,
  specialisationById,
  type RoomRecord,
} from '@aula/core/data/records'
import { HELP } from '../../content/help'
import { OwnershipBar } from './OwnershipBar'

/**
 * The estate, room by room.
 *
 * Rooms arrive from the Setup wizard as groups; this is where an individual
 * room gets a real name, a facility, and the hours it is unavailable.
 */

function facilityLabel(rec: RoomRecord): string | undefined {
  const owned = new Set(rec.features)
  return [...ROOM_SPECIALISATIONS]
    .filter(
      sp => sp.kind === rec.kind && sp.features.length > 0 && sp.features.every(f => owned.has(f)),
    )
    .toSorted((a, b) => b.features.length - a.features.length)[0]?.label
}

export function RoomsTab() {
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
                                <Meter
                                  ariaLabel={`${rec.name} utilisation`}
                                  value={used / weekSlots}
                                />
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
            /* `title` alone is a tooltip: several screen readers skip it and a
               keyboard user never sees it. The same text as `aria-label` is
               what makes a grid of forty unlabelled cells navigable. */
            aria-label={`${DAY_NAMES[props.day]} slot ${slot + 1}`}
            title={`${DAY_NAMES[props.day]} slot ${slot + 1}: ${off ? 'unavailable' : 'available'}`}
            onClick={() => props.onToggle(props.day, slot)}
          />
        )
      })}
    </>
  )
}
