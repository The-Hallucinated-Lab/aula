import { computeMetrics } from '@aula/core/data/metrics'
import { DAY_NAMES, canTeach } from '@aula/core/data/model'
import { checkMove as engineCheckMove } from '@aula/core/engine/solver'
import type { Slice } from '../types'
import { overlapsSlots } from '../editing'

/**
 * Direct edits to a solved schedule.
 *
 * Dragging a session, locking one in place, and covering an absence. Every move
 * is re-checked against the same rules the solver applied, so the interface can
 * refuse with a constraint number rather than silently producing a clash.
 */

/** The members of `AppState` this slice is responsible for. */
type Owned =
  'applySubstitutions' | 'checkMove' | 'moveSession' | 'proposeSubstitutes' | 'toggleLock'

export const scheduleActions: Slice<Owned> = (set, get) => ({
  checkMove(sessionId, day, slot) {
    const { institution, states, sessions, locked, config } = get()
    return engineCheckMove(
      institution,
      states,
      sessions,
      sessionId,
      day,
      slot,
      [...locked],
      config.customConstraints ?? [],
    )
  },

  moveSession(sessionId, day, slot) {
    const result = get().checkMove(sessionId, day, slot)
    const { sessions, institution } = get()
    const session = sessions.find(s => s.id === sessionId)
    if (!session) return result
    const course = institution.courses.find(c => c.id === session.courseId)

    if (get().locked.has(sessionId)) {
      get().log('reject', `${course?.code} is pinned — unpin it before moving`)
      return {
        ok: false,
        rejections: [{ code: 'C422', label: 'Manual lock', message: 'Session is pinned' }],
        softDelta: 0,
      }
    }

    if (!result.ok) {
      const first = result.rejections[0]
      get().log(
        'reject',
        first
          ? `Blocked: ${course?.code} → ${DAY_NAMES[day]} — ${first.code} ${first.message}`
          : `Blocked: ${course?.code} → ${DAY_NAMES[day]}`,
      )
      return result
    }

    const next = sessions.map(s =>
      s.id === sessionId ? { ...s, day, slot, roomId: result.relocatedRoomId ?? s.roomId } : s,
    )
    set({ sessions: next, metrics: computeMetrics(institution, next) })

    const relocated = result.relocatedRoomId
      ? ` (relocated to ${institution.rooms.find(r => r.id === result.relocatedRoomId)?.name})`
      : ''
    get().log('move', `${course?.code} ${course?.name} moved to ${DAY_NAMES[day]}${relocated}`)
    return result
  },

  toggleLock(sessionId) {
    const locked = new Set(get().locked)
    if (locked.has(sessionId)) locked.delete(sessionId)
    else locked.add(sessionId)
    set({ locked })
  },

  proposeSubstitutes(staffId, day) {
    const { sessions, institution, metrics } = get()
    const affected = sessions.filter(s => s.staffId === staffId && s.day === day)
    const absent = institution.staff.find(f => f.id === staffId)
    if (!absent) return []

    return affected.map(s => {
      const course = institution.courses.find(c => c.id === s.courseId)
      const busy = new Set(
        sessions.filter(x => x.day === day && overlapsSlots(x, s)).map(x => x.staffId),
      )
      const dayHours = new Map<string, number>()
      for (const onDay of sessions.filter(candidate => candidate.day === day)) {
        dayHours.set(onDay.staffId, (dayHours.get(onDay.staffId) ?? 0) + onDay.length)
      }

      // `canTeach` covers sabbatical, expertise and the group-size ceiling, so a
      // substitute is held to exactly the standard the solver applied originally
      const headcount =
        course?.enrolment ?? institution.cohorts.find(g => g.id === s.cohortId)?.size ?? 0
      const candidates = institution.staff
        .filter(
          f =>
            f.id !== staffId &&
            !!course &&
            canTeach(f, course, headcount) &&
            !busy.has(f.id) &&
            !f.blockedDays.includes(day) &&
            (dayHours.get(f.id) ?? 0) + s.length <= f.maxPerDay &&
            (metrics.staffLoad.get(f.id) ?? 0) + s.length <= f.maxPerWeek,
        )
        .toSorted((a, b) => {
          const deptA = a.deptId === absent.deptId ? 0 : 1
          const deptB = b.deptId === absent.deptId ? 0 : 1
          if (deptA !== deptB) return deptA - deptB
          return (metrics.staffLoad.get(a.id) ?? 0) - (metrics.staffLoad.get(b.id) ?? 0)
        })

      const best = candidates[0] ?? null
      return {
        sessionId: s.id,
        courseId: s.courseId,
        slotLabel: `${institution.grid.labels[s.slot] ?? ''} · ${course?.code ?? ''}`,
        candidateId: best?.id ?? null,
        candidateName: best?.name ?? 'No qualified substitute is free',
        sameDept: best ? best.deptId === absent.deptId : false,
        load: best ? (metrics.staffLoad.get(best.id) ?? 0) : 0,
      }
    })
  },

  applySubstitutions(staffId, day, proposals) {
    const { sessions, institution } = get()
    const byId = new Map(
      proposals.filter(p => p.candidateId).map(p => [p.sessionId, p.candidateId!]),
    )
    const next = sessions.map(s =>
      byId.has(s.id) ? { ...s, staffId: byId.get(s.id)!, substitutedFor: staffId } : s,
    )
    const absent = institution.staff.find(f => f.id === staffId)

    set(state => ({
      sessions: next,
      metrics: computeMetrics(institution, next),
      absences: new Set(state.absences).add(`${staffId}:${day}`),
    }))
    get().log(
      'substitute',
      `${absent?.name} absent ${DAY_NAMES[day]} — ${byId.size} session${byId.size === 1 ? '' : 's'} repaired locally, the rest of the week untouched`,
    )
  },
})
