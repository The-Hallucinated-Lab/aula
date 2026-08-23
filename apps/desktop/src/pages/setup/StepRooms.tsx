import { useState } from 'react'
import { Callout, Combobox, Field, NumberInput, Section, TextInput } from '../../components/ui'
import { type BuildingConfig, type RoomGroupConfig } from '@aula/core/data/config'
import { SELECTABLE_ROOM_KINDS, type RoomKind } from '@aula/core/data/model'
import { FEATURE_PRESETS, ROOM_SPECIALISATIONS, specialisationById } from '@aula/core/data/records'
import { HELP } from '../../content/help'
import { applyPatch, patchAt, type Clearable } from '../../lib/records'
import { nextId, type StepProps } from './steps'

/**
 * The estate — buildings, their storeys, and what sits on each floor.
 *
 * Rooms are described as groups rather than one by one: an institution has
 * "twelve 60-seat classrooms on floor 2", not twelve individually named records
 * to type. A group carries a floor because accessibility rules (C147, C384) read
 * the floor and whether the building has a lift.
 */

export function StepRooms({ config, patch }: StepProps) {
  const [openFeatures, setOpenFeatures] = useState<string | null>(null)

  const updateBuilding = (i: number, p: Partial<BuildingConfig>) => {
    const next = patchAt(config.buildings, i, p)
    const building = next[i]
    if (!building) return

    /* Storeys can be reduced after rooms were laid out on the upper ones. Those
       rooms still exist, so they come down to the new top floor rather than
       disappearing into a floor nobody can reach. */
    const groups = config.roomGroups.map(g =>
      g.buildingId === building.id && g.floor > building.floors
        ? { ...g, floor: building.floors }
        : g,
    )

    patch({ buildings: next, roomGroups: groups })
  }

  const updateGroup = (id: string, p: Clearable<RoomGroupConfig>) => {
    patch({ roomGroups: config.roomGroups.map(g => (g.id === id ? applyPatch(g, p) : g)) })
  }

  const removeGroup = (id: string) => {
    patch({ roomGroups: config.roomGroups.filter(g => g.id !== id) })
    if (openFeatures === id) setOpenFeatures(null)
  }

  const addGroup = (buildingId: string, floor: number) => {
    const preset = ROOM_SPECIALISATIONS[0]
    if (!preset) return
    patch({
      roomGroups: [
        ...config.roomGroups,
        {
          id: nextId('rg'),
          buildingId,
          floor,
          kind: preset.kind,
          count: 2,
          capacity: preset.capacity,
          turnoverMinutes: preset.turnoverMinutes,
          features: [...preset.features],
          specialisation: preset.id,
        },
      ],
    })
  }

  /** Applying a facility resets the group to what that facility actually is. */
  const applySpecialisation = (g: RoomGroupConfig, specId: string) => {
    const spec = specialisationById(specId)
    if (!spec) {
      updateGroup(g.id, { specialisation: undefined })
      return
    }
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
                    onClick={() =>
                      patch({
                        buildings: config.buildings.filter((_, x) => x !== i),
                        roomGroups: config.roomGroups.filter(g => g.buildingId !== b.id),
                      })
                    }
                  >
                    Remove block
                  </button>
                </div>

                <div className="card-pad">
                  <div className="field-grid">
                    {config.campuses.length > 1 && (
                      <Field label="Campus">
                        <Combobox
                          value={b.campus}
                          ariaLabel="Campus"
                          options={config.campuses.map(c => ({ value: c.id, label: c.name }))}
                          onChange={v => updateBuilding(i, { campus: v })}
                        />
                      </Field>
                    )}
                    <Field label="Number of floors" hint={HELP.floors}>
                      <Combobox
                        value={String(b.floors)}
                        ariaLabel="Number of floors"
                        options={Array.from({ length: 20 }, (_, k) => k + 1).map(n => ({
                          value: String(n),
                          label: `${n} floor${n === 1 ? '' : 's'}`,
                          hint: n === 1 ? 'ground only' : undefined,
                        }))}
                        onChange={v => updateBuilding(i, { floors: Number(v) })}
                      />
                    </Field>
                    <Field label="Access" hint={HELP.hasElevator}>
                      <div className="row" style={{ gap: 18, flexWrap: 'wrap', minHeight: 34 }}>
                        <label className="row small" style={{ gap: 7 }}>
                          <input
                            type="checkbox"
                            checked={b.hasElevator}
                            aria-label="Has lift"
                            onChange={() => updateBuilding(i, { hasElevator: !b.hasElevator })}
                          />
                          Has a lift
                        </label>
                        <label className="row small" style={{ gap: 7 }}>
                          <input
                            type="checkbox"
                            checked={b.accessible}
                            aria-label="Accessible"
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
                                <Combobox
                                  value={g.specialisation ?? ''}
                                  ariaLabel="Facility"
                                  options={[
                                    { value: '', label: 'General purpose' },
                                    ...ROOM_SPECIALISATIONS.map(sp => ({
                                      value: sp.id,
                                      label: sp.label,
                                      keywords: sp.hint,
                                    })),
                                  ]}
                                  onChange={v => applySpecialisation(g, v)}
                                />
                              </Field>
                              <Field label="Room type">
                                <Combobox
                                  value={g.kind}
                                  ariaLabel="Room type"
                                  options={SELECTABLE_ROOM_KINDS.map(k => ({ value: k, label: k }))}
                                  onChange={v => updateGroup(g.id, { kind: v as RoomKind })}
                                />
                              </Field>
                              <Field label="How many">
                                <NumberInput
                                  value={g.count}
                                  min={0}
                                  max={400}
                                  ariaLabel="How many"
                                  onChange={n => updateGroup(g.id, { count: n })}
                                />
                              </Field>
                              <Field label="Seats each">
                                <NumberInput
                                  value={g.capacity}
                                  min={1}
                                  max={2000}
                                  ariaLabel="Seats each"
                                  onChange={n => updateGroup(g.id, { capacity: n })}
                                />
                              </Field>
                              <Field label="Turnover">
                                <NumberInput
                                  value={g.turnoverMinutes}
                                  min={0}
                                  max={180}
                                  step={5}
                                  suffix="min"
                                  ariaLabel="Turnover"
                                  onChange={n => updateGroup(g.id, { turnoverMinutes: n })}
                                />
                              </Field>
                              <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                                <button
                                  className="btn btn-ghost"
                                  aria-expanded={openFeatures === g.id}
                                  title="Room capabilities"
                                  onClick={() =>
                                    setOpenFeatures(openFeatures === g.id ? null : g.id)
                                  }
                                >
                                  {g.features.length} ▾
                                </button>
                                <button
                                  className="btn btn-danger-soft"
                                  title="Remove this room type"
                                  onClick={() => removeGroup(g.id)}
                                >
                                  ×
                                </button>
                              </div>
                            </div>

                            {openFeatures === g.id && (
                              <div style={{ padding: '0 0 14px' }}>
                                <p className="field-hint" style={{ marginBottom: 8 }}>
                                  {specialisationById(g.specialisation)?.hint ??
                                    'Only tick what a course could actually require.'}{' '}
                                  A course asking for something no room has is refused with that
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
                                        onClick={() =>
                                          updateGroup(g.id, {
                                            features: on
                                              ? g.features.filter(x => x !== f.key)
                                              : [...g.features, f.key],
                                          })
                                        }
                                      >
                                        {f.label}
                                      </button>
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
          <button
            className="btn btn-soft"
            onClick={() =>
              patch({
                buildings: [
                  ...config.buildings,
                  {
                    id: nextId('b'),
                    name: 'New block',
                    campus: config.campuses[0]?.id ?? 'main',
                    walkMinutes: 8,
                    floors: 2,
                    hasElevator: true,
                    accessible: true,
                  },
                ],
              })
            }
          >
            + Add building
          </button>
        </div>
      </Section>
    </>
  )
}
