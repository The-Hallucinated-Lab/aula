/**
 * CSV import — the seam where real institutional data replaces generated data.
 *
 * The generator turns figures into an institution; that is what makes a new
 * project usable in a minute. It is not what anybody wants once they have a
 * roster. `EntityOverrides` already means "explicit records take over and the
 * generator stops inventing this type" (D-22), so an import is that same
 * mechanism fed from a file instead of from an edit, and it inherits the whole
 * validation, editing and reset-to-generated path unchanged.
 *
 * Two rules govern this file:
 *
 *  1. **No row is ever silently dropped.** A row that cannot be used comes back
 *     with its line number and a sentence saying why. A roster that imports
 *     "successfully" with eleven people missing is worse than one that refuses.
 *  2. **Nothing here trusts the file.** Numbers may be blank, codes may not
 *     exist, columns may be missing or in any order. Everything resolves
 *     against the configuration or is reported.
 */

/**
 * The shared half of CSV import.
 *
 * Two rules govern every importer built on this:
 *
 *  1. **No row is ever silently dropped.** A row that cannot be used comes back
 *     with its line number and a sentence saying why. A roster that imports
 *     "successfully" with eleven people missing is worse than one that refuses.
 *  2. **Nothing here trusts the file.** Numbers may be blank, codes may not
 *     exist, columns may be missing or in any order. Everything resolves
 *     against the configuration or is reported.
 *
 * The parser is written out rather than pulled in because the format is small
 * and the failure modes are specific: a quoted field containing a comma, a
 * doubled quote meaning a literal one, and CRLF from Excel. A split on commas
 * gets all three wrong, and a course named "Design, Analysis of Algorithms" is
 * not an unusual thing to find in a real file.
 */

export type ImportKind = 'staff' | 'rooms' | 'courses'

export interface RowProblem {
  /** 1-based line in the file as the user sees it, header included */
  line: number
  message: string
}

export interface ImportResult<T> {
  rows: T[]
  problems: RowProblem[]
  /** columns present in the file that nothing reads */
  ignoredColumns: string[]
  /** required columns the file did not have */
  missingColumns: string[]
}

/* ------------------------------------------------------------------ *
 * CSV parsing
 * ------------------------------------------------------------------ */

/**
 * Parse CSV into rows of cells.
 *
 * Written out rather than pulled in because the format is small and the
 * failure modes are specific: a quoted field containing a comma, a doubled
 * quote meaning a literal one, and CRLF from Excel. A split on commas gets all
 * three wrong, and a course named "Design, Analysis of Algorithms" is not an
 * unusual thing to find in a real file.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  // A byte-order mark survives Excel's "Save as CSV" and would otherwise
  // become part of the first column's name.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < src.length; i++) {
    const c = src[i]

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
      continue
    }

    if (c === '"') {
      quoted = true
      continue
    }
    if (c === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (c === '\r') continue
    if (c === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += c
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

/* ------------------------------------------------------------------ *
 * Column handling
 * ------------------------------------------------------------------ */

/** "Staff code", "staff_code" and "STAFFCODE" are the same column. */
export const canonical = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')

export interface Column {
  key: string
  /** every spelling accepted for this column, canonicalised */
  aliases: string[]
  required?: boolean
}

export function indexColumns(header: string[], columns: Column[]) {
  const seen = header.map(canonical)
  const at: Record<string, number> = {}
  for (const col of columns) {
    const i = seen.findIndex(h => col.aliases.includes(h))
    if (i >= 0) at[col.key] = i
  }
  const missing = columns.filter(c => c.required && at[c.key] === undefined).map(c => c.key)
  const claimed = new Set(Object.values(at))
  const ignored = header.filter((_, i) => !claimed.has(i)).filter(h => h.trim() !== '')
  return { at, missing, ignored }
}

export const cell = (row: string[], at: Record<string, number>, key: string) => {
  const column = at[key]
  return column === undefined ? '' : (row[column] ?? '').trim()
}

export const asInt = (v: string, fallback: number) => {
  const n = Number(v)
  return v !== '' && Number.isFinite(n) ? Math.trunc(n) : fallback
}

/**
 * A number that says whether it was really there.
 *
 * `asInt` alone cannot distinguish "blank, so use the default" from
 * "somebody typed *sixty*, so use the default" — and the second is a mistake
 * the importer must report rather than absorb.
 */
export const readInt = (v: string, fallback: number): { value: number; bad: boolean } => {
  if (v.trim() === '') return { value: fallback, bad: false }
  const n = Number(v)
  return Number.isFinite(n) && n === Math.trunc(n)
    ? { value: n, bad: false }
    : { value: fallback, bad: true }
}

export const asFlag = (v: string, fallback: boolean) => {
  const s = v.trim().toLowerCase()
  if (['yes', 'y', 'true', '1'].includes(s)) return true
  if (['no', 'n', 'false', '0'].includes(s)) return false
  return fallback
}

/** Semicolon-separated lists, because commas belong to the format. */
export const asList = (v: string) =>
  v
    .split(';')
    .map(s => s.trim())
    .filter(s => s !== '')

/** Match a named value case-insensitively against the values the model allows. */
export function oneOf<T extends string>(v: string, allowed: readonly T[], fallback: T): T {
  const hit = allowed.find(a => canonical(a) === canonical(v))
  return hit ?? fallback
}

let seq = 0
export const uid = (prefix: string) => `${prefix}-i${Date.now().toString(36)}${seq++}`
