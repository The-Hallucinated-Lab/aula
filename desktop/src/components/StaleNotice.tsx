import { useApp } from '../store'
import { Callout } from './ui'

/**
 * Editing the institution does not re-solve the week — a solve costs seconds
 * and the administrator decides when to spend them. What it must never do is
 * leave a schedule on screen that silently no longer matches the staff, rooms
 * and courses it was built from. This says so, and offers the one-click fix.
 */
export function StaleNotice() {
  const stale = useApp(s => s.scheduleStale)
  const solving = useApp(s => s.solving)
  const regenerate = useApp(s => s.regenerate)

  if (!stale) return null

  return (
    <Callout tone="warn" title="This timetable is out of date">
      The institution has changed since the last solve, so the schedule — and every figure
      and export drawn from it — still reflects the previous staff, rooms and courses.{' '}
      <button
        className="btn btn-soft"
        style={{ marginTop: 10 }}
        disabled={solving}
        onClick={() => void regenerate()}
      >
        {solving ? 'Solving…' : 'Re-solve now'}
      </button>
    </Callout>
  )
}
