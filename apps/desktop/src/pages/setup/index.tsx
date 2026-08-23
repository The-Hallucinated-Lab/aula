import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../../store'
import { useToast } from '../../components/Toast'
import { Dialog } from '../../components/Dialog'
import { Callout, Hero, Meter, Pill } from '../../components/ui'
import { type SetupConfig } from '@aula/core/data/config'
import { FIRST_STEP, STEPS_FOR, type SetupMode, type StepId } from './steps'
import { StepGrid } from './StepGrid'
import { StepHierarchy } from './StepHierarchy'
import { StepIdentity } from './StepIdentity'
import { StepProfiles } from './StepProfiles'
import { StepPrograms } from './StepPrograms'
import { StepReview } from './StepReview'
import { StepRooms } from './StepRooms'
import { StepStaff } from './StepStaff'
import { StepTerm } from './StepTerm'

/**
 * The setup wizard shell.
 *
 * Owns the step list, the draft configuration and the confirmation gate; the
 * steps themselves own their fields and live one file each in this directory.
 * Two entry points share it — the institution wizard for settings that change
 * once, and the term wizard a timetable manager revisits each session.
 */

export function Setup() {
  return <SetupWizard mode="term" />
}

/** One-time setup — the shape of the institution itself. */
export function InstitutionSetup() {
  return <SetupWizard mode="institution" />
}

function SetupWizard({ mode }: { mode: SetupMode }) {
  const {
    config,
    draftConfig,
    summary,
    editDraft,
    commitDraft,
    discardDraft,
    resetConfig,
    completeSetup,
    solving,
  } = useApp()
  const STEPS = STEPS_FOR[mode]
  const [step, setStep] = useState<StepId>(FIRST_STEP[mode])
  const [confirming, setConfirming] = useState(false)
  /* Constant settings are locked on arrival. A timetable manager has no reason
     to be in here, and the review was clear that edits at this level ripple
     through the whole database. */
  const [unlocked, setUnlocked] = useState(mode === 'term')
  const toast = useToast()
  const navigate = useNavigate()

  const index = STEPS.findIndex(s => s.id === step)
  const blocked = summary.errors.length > 0

  /* Everything on this screen edits a draft. The preview moves as you type, so
     the impact of a change is visible, but nothing is written to the project
     until Save — changing the shape of the institution reaches every course,
     section, room and person derived from it. */
  const shown = draftConfig ?? config
  const dirty = draftConfig !== null
  const patch = (p: Partial<SetupConfig>) => editDraft(p)

  /* Which top-level settings differ, so the prompt can say what it is about to
     do rather than asking a bare "are you sure". */
  const changed = useMemo(() => {
    if (!draftConfig) return []
    return (Object.keys(draftConfig) as (keyof SetupConfig)[]).filter(
      k => JSON.stringify(draftConfig[k]) !== JSON.stringify(config[k]),
    )
  }, [draftConfig, config])
  const changedCount = changed.length

  const finish = async () => {
    /* The preview shows the draft but `completeSetup` solves the saved config.
       Generating with changes outstanding would quietly schedule the old
       institution and show it beside the new figures. */
    if (dirty) {
      toast('Save your changes before generating', 'danger')
      setConfirming(true)
      return
    }
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
        eyebrow={mode === 'institution' ? 'One-time setup' : 'Setup for this term'}
        title={
          mode === 'institution' ? (
            <>
              The shape of <strong>your institution</strong>
            </>
          ) : (
            <>
              What you are running <strong>this term</strong>
            </>
          )
        }
        desc={
          mode === 'institution'
            ? 'Faculties, schools, blocks, floors and the shape of the teaching day. Entered once — a timetable manager should never need to come here.'
            : 'Sections, staffing, curriculum policy and term dates. These are the figures that change from one session to the next.'
        }
        side={
          <div className="row" style={{ gap: 8 }}>
            <Pill tone={blocked ? 'danger' : 'ok'}>
              {blocked ? `${summary.errors.length} blocking` : 'Configuration valid'}
            </Pill>
            {mode === 'institution' && (
              <button
                className={`btn ${unlocked ? 'btn-soft' : 'btn-ghost'}`}
                onClick={() => setUnlocked(u => !u)}
              >
                {unlocked ? '🔓 Editing' : '🔒 Unlock to edit'}
              </button>
            )}
            {mode === 'institution' && (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  resetConfig()
                  toast('Reset to defaults')
                }}
              >
                Reset
              </button>
            )}
          </div>
        }
      />

      {mode === 'institution' && !unlocked && (
        <div className="page" style={{ paddingBottom: 0 }}>
          <Callout tone="info" title="These settings are locked">
            They describe the institution itself and everything else is built from them. Unlock only
            when the estate, the hierarchy or the shape of the teaching day has actually changed.
            Routine work belongs in <Link to="/setup">this term's setup</Link>.
          </Callout>
        </div>
      )}

      <div className="page">
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
              <div className="spread small">
                <span className="muted">Students</span>
                <b className="tnum">{summary.students.toLocaleString()}</b>
              </div>
              <div className="spread small">
                <span className="muted">Sections</span>
                <b className="tnum">{summary.cohorts}</b>
              </div>
              <div className="spread small">
                <span className="muted">Courses</span>
                <b className="tnum">{summary.courses}</b>
              </div>
              <div className="spread small">
                <span className="muted">Rooms</span>
                <b className="tnum">{summary.rooms}</b>
              </div>
              <div className="spread small">
                <span className="muted">Staff</span>
                <b className="tnum">{summary.staffTotal}</b>
              </div>
              <div className="divider" />
              <Meter
                value={Number.isFinite(summary.pressure) ? Math.min(summary.pressure, 1) : 1}
                label="Room pressure"
                tone={
                  summary.pressure > 0.85
                    ? 'var(--danger)'
                    : summary.pressure > 0.6
                      ? 'var(--warn)'
                      : 'var(--ok)'
                }
              />
              <p className="small muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
                {summary.demand} weekly sessions into {summary.roomSlotsPerWeek} room-slots.
              </p>
            </div>
          </nav>

          <div className="wizard-body">
            <fieldset className="wizard-fields" disabled={!unlocked}>
              {step === 'identity' && <StepIdentity config={shown} patch={patch} />}
              {step === 'hierarchy' && <StepHierarchy config={shown} patch={patch} />}
              {step === 'grid' && <StepGrid config={shown} patch={patch} />}
              {step === 'rooms' && <StepRooms config={shown} patch={patch} />}
              {step === 'profiles' && <StepProfiles config={shown} patch={patch} />}
              {step === 'programs' && <StepPrograms config={shown} patch={patch} />}
              {step === 'staff' && <StepStaff config={shown} patch={patch} />}
              {step === 'term' && <StepTerm config={shown} patch={patch} />}
              {step === 'review' && <StepReview />}
            </fieldset>

            <div className="wizard-actions">
              <button
                className="btn btn-ghost"
                disabled={index === 0}
                onClick={() => setStep(STEPS[Math.max(0, index - 1)]?.id ?? FIRST_STEP[mode])}
              >
                ← Back
              </button>
              <div className="row" style={{ gap: 10 }}>
                {index < STEPS.length - 1 ? (
                  <button
                    className="btn btn-primary"
                    onClick={() => setStep(STEPS[index + 1]?.id ?? step)}
                  >
                    Continue →
                  </button>
                ) : mode === 'institution' ? (
                  <Link className="btn btn-primary" to="/setup">
                    Set up this term →
                  </Link>
                ) : (
                  <button className="btn btn-primary" onClick={finish} disabled={solving}>
                    {solving ? 'Solving…' : '✦ Generate timetable'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The review was explicit that institution changes must not save as you
          type, and that saving should ask. This bar appears only once there is
          something to save, and names how many settings changed. */}
      {dirty && (
        <div className="draft-bar" role="status">
          <span className="draft-mark" aria-hidden>
            ●
          </span>
          <span className="draft-text">
            <b>{changedCount}</b> unsaved {changedCount === 1 ? 'change' : 'changes'} to
            {mode === 'institution' ? ' institution settings' : " this term's setup"} — the preview
            reflects {changedCount === 1 ? 'it' : 'them'}; the project does not.
          </span>
          <button
            className="btn btn-ghost"
            onClick={() => {
              discardDraft()
              toast('Changes discarded')
            }}
          >
            Discard
          </button>
          <button className="btn btn-primary" onClick={() => setConfirming(true)}>
            Save changes
          </button>
        </div>
      )}

      {confirming && (
        <Dialog
          title="Save these changes?"
          subtitle={`${changedCount} ${changedCount === 1 ? 'setting' : 'settings'} will change.`}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  commitDraft()
                  setConfirming(false)
                  toast(
                    mode === 'institution' ? 'Institution settings saved' : 'Term setup saved',
                    'ok',
                  )
                }}
              >
                Save changes
              </button>
            </>
          }
        >
          <Callout tone="warn" title="This reaches everything built from these figures">
            Courses, sections, rooms and staff are all derived from the settings on this screen.
            Saving rebuilds them, and any timetable you have already generated will need solving
            again.
          </Callout>
          {changed.length > 0 && (
            <ul className="draft-list">
              {changed.map(k => (
                <li key={k}>
                  <code>{k}</code>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
    </div>
  )
}
