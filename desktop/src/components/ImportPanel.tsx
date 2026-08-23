import { useState } from 'react'
import { Dialog } from './Dialog'
import { Callout } from './ui'
import { useApp } from '../store'
import { useToast } from '../components/Toast'
import { openText, saveText } from '../platform'
import {
  importCourses, importRooms, importStaff, requiredColumns, templateFor,
  type ImportKind, type RowProblem,
} from '../data/importers'
import type { CourseRecord, RoomRecord, StaffRecord } from '../data/records'

const LABEL: Record<ImportKind, string> = {
  staff: 'staff', rooms: 'rooms', courses: 'courses',
}

interface Staged {
  rows: StaffRecord[] | RoomRecord[] | CourseRecord[]
  problems: RowProblem[]
  ignoredColumns: string[]
  missingColumns: string[]
  fileName: string
}

/**
 * Import a roster, a room list or a course list from a spreadsheet export.
 *
 * Nothing is applied on opening the file. The parse is shown first — how many
 * rows were read, what was refused and why — because an import that quietly
 * loses eleven people is worse than one that refuses outright. Applying is a
 * second, deliberate click.
 */
export function ImportPanel({ kind, onClose }: { kind: ImportKind; onClose: () => void }) {
  const { config, importEntity } = useApp()
  const toast = useToast()
  const [staged, setStaged] = useState<Staged | null>(null)
  const [busy, setBusy] = useState(false)

  const pick = async () => {
    setBusy(true)
    try {
      const res = await openText([{ name: 'Spreadsheet export', extensions: ['csv', 'txt'] }])
      if (!res.ok) {
        if (!res.canceled) toast(res.error ?? 'Could not read that file', 'danger')
        return
      }
      const text = res.data ?? ''
      const parsed = kind === 'staff' ? importStaff(text, config)
        : kind === 'rooms' ? importRooms(text, config)
          : importCourses(text, config)
      setStaged({ ...parsed, fileName: res.path ?? 'the file' })
    } finally {
      setBusy(false)
    }
  }

  const downloadTemplate = async () => {
    const res = await saveText({
      suggestedName: `aula-${kind}-template.csv`,
      data: templateFor(kind, config),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })
    if (res.ok) toast('Template saved', 'ok')
    else if (!res.canceled) toast(res.error ?? 'Could not save the template', 'danger')
  }

  const apply = () => {
    if (!staged || staged.rows.length === 0) return
    importEntity(kind, staged.rows)
    toast(`Imported ${staged.rows.length} ${LABEL[kind]}`, 'ok')
    onClose()
  }

  const refused = staged?.problems.filter(p => p.message.includes('skipped')).length ?? 0

  return (
    <Dialog
      title={`Import ${LABEL[kind]}`}
      subtitle="From a CSV export of your existing records."
      size="wide"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={downloadTemplate}>Download template</button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!staged || staged.rows.length === 0}
            onClick={apply}
          >
            {staged ? `Replace ${LABEL[kind]} with ${staged.rows.length} row${staged.rows.length === 1 ? '' : 's'}` : 'Choose a file first'}
          </button>
        </>
      }
    >
      {!staged && (
        <>
          <Callout tone="info" title="What the file needs">
            A header row, and columns for <b>{requiredColumns(kind).join(', ')}</b>. Column
            order does not matter and spelling is forgiving — &ldquo;Employee ID&rdquo;,
            &ldquo;employee_id&rdquo; and &ldquo;EMPID&rdquo; are all the same column. Lists
            inside a cell are separated by semicolons, so commas stay free for the format.
          </Callout>
          <div style={{ height: 16 }} />
          <button className="btn btn-primary" onClick={pick} disabled={busy}>
            {busy ? 'Reading…' : 'Choose a CSV file…'}
          </button>
        </>
      )}

      {staged && (
        <>
          {staged.missingColumns.length > 0 ? (
            <Callout tone="danger" title="That file is missing a column Aula cannot do without">
              {staged.fileName} has no <b>{staged.missingColumns.join('</b>, <b>')}</b> column.
              Nothing was imported. The template below has every column in the right shape.
            </Callout>
          ) : (
            <Callout
              tone={refused > 0 ? 'warn' : 'ok'}
              title={`${staged.rows.length} row${staged.rows.length === 1 ? '' : 's'} ready${refused > 0 ? `, ${refused} refused` : ''}`}
            >
              Read from {staged.fileName}. Nothing has changed yet &mdash; applying replaces
              the current {LABEL[kind]} entirely, and the generator stops inventing them.
            </Callout>
          )}

          {staged.ignoredColumns.length > 0 && (
            <p className="small muted" style={{ marginTop: 12 }}>
              Columns Aula does not read, left alone: {staged.ignoredColumns.join(', ')}.
            </p>
          )}

          {staged.problems.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="field-label" style={{ marginBottom: 6 }}>
                {staged.problems.length} thing{staged.problems.length === 1 ? '' : 's'} to know
              </div>
              <div className="import-problems">
                {staged.problems.map((p, i) => (
                  <div key={i} className="import-problem">
                    <span className="import-line mono">line {p.line}</span>
                    <span>{p.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={pick} disabled={busy}>
              Choose a different file
            </button>
          </div>
        </>
      )}
    </Dialog>
  )
}
