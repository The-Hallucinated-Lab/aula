import { useState } from 'react'
import { useApp } from '../../store'
import { useToast } from '../../components/Toast'
import { ImportPanel } from '../../components/ImportPanel'

/**
 * Whether an entity type is still generated, or has been taken over.
 *
 * The first explicit edit to a type snapshots the whole generated list into
 * `overrides` and the generator stops inventing it (D-22). That transition is
 * invisible and irreversible-looking, so the screen says which side of it the
 * user is on and offers the way back.
 */
export function OwnershipBar({
  kind,
  owned,
}: {
  kind: 'staff' | 'courses' | 'rooms'
  owned: boolean
}) {
  const resetEntity = useApp(s => s.resetEntity)
  const toast = useToast()
  const [importing, setImporting] = useState(false)
  const label = kind === 'staff' ? 'staff' : kind === 'courses' ? 'courses' : 'rooms'

  return (
    <div className="panel spread" style={{ marginBottom: 16, padding: '11px 16px' }}>
      <span className="small muted">
        {owned
          ? `These ${label} are yours — edits are saved with the project and the generator no longer touches them.`
          : `These ${label} are generated from your Setup figures. Editing any of them makes the whole list yours to keep.`}
      </span>
      <span className="row" style={{ gap: 8 }}>
        <button className="btn btn-ghost" onClick={() => setImporting(true)}>
          Import from CSV
        </button>
        {owned && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              resetEntity(kind)
              toast(`Reset ${label} to the generated values`)
            }}
          >
            Reset to generated
          </button>
        )}
      </span>
      {importing && <ImportPanel kind={kind} onClose={() => setImporting(false)} />}
    </div>
  )
}
