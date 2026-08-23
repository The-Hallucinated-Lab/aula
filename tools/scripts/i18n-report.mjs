#!/usr/bin/env node
/**
 * How much of the interface is translatable, and what is left.
 *
 * i18n is not a change you finish in one pass — there are several hundred
 * strings across nine screens, and moving one without reading its context
 * produces a bundle full of sentence fragments that no translator can use. So
 * the migration is incremental and this makes it measurable: a number that has
 * to go up, and a list naming the next files to do.
 *
 * The heuristic is deliberately blunt. It counts user-visible English in JSX —
 * text nodes and the attributes that carry copy — and reports it per file.
 * It will have false positives (a `title` holding a course code) and false
 * negatives (a sentence assembled from variables). It is a progress meter, not
 * a gate, and it is not wired into `npm run check` for that reason.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const uiRoot = join(repoRoot, 'apps', 'desktop', 'src')

/** Attributes that hold copy a person reads, as opposed to identifiers. */
const COPY_ATTRIBUTES =
  /\b(label|title|placeholder|ariaLabel|aria-label|desc|hint|eyebrow|blurb|tagline|emptyText|subtitle)="([^"]{3,})"/g

/** A JSX text node with real words in it. */
const TEXT_NODE = />\s*([A-Z][a-z][^<>{}\n]{3,})\s*</g

/** Files that are not interface copy. */
const SKIP = [/[\\/]i18n[\\/]/, /[\\/]content[\\/]help\.ts$/, /\.test\.tsx?$/, /[\\/]styles[\\/]/]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.tsx?$/.test(path)) out.push(path)
  }
  return out
}

const files = walk(uiRoot).filter(f => !SKIP.some(re => re.test(f)))

/* Strings already in the bundle. `content/help.ts` is registered wholesale as
   the `help` namespace, so its entries are translatable even though no `t()`
   call names them individually — counting only `t()` sites would understate
   the position by fifty. */
const bundleKeys = (() => {
  const en = readFileSync(join(uiRoot, 'i18n', 'locales', 'en.ts'), 'utf-8')
  const help = readFileSync(join(uiRoot, 'content', 'help.ts'), 'utf-8')
  const inBundle = (en.match(/^\s{4}[a-zA-Z][\w]*:/gm) ?? []).length
  const inHelp = (help.match(/^\s{2}[a-zA-Z][\w]*:/gm) ?? []).length
  return inBundle + inHelp
})()

const rows = []
let translated = 0
let remaining = 0

for (const file of files) {
  const source = readFileSync(file, 'utf-8')
  const uses = (source.match(/\bt\(['"`]/g) ?? []).length
  const literals = new Set()
  for (const [, , value] of source.matchAll(COPY_ATTRIBUTES)) {
    if (value && /[a-z]{3}/.test(value)) literals.add(value.trim())
  }
  for (const [, value] of source.matchAll(TEXT_NODE)) {
    const text = value.trim()
    if (text && /\s/.test(text)) literals.add(text)
  }
  translated += uses
  remaining += literals.size
  if (uses > 0 || literals.size > 0) {
    rows.push({
      file: relative(repoRoot, file).replaceAll('\\', '/'),
      translated: uses,
      remaining: literals.size,
    })
  }
}

rows.sort((a, b) => b.remaining - a.remaining)

const inPlace = translated + bundleKeys
const total = inPlace + remaining
const pct = total === 0 ? 100 : Math.round((inPlace / total) * 100)

const reportsDir = join(repoRoot, 'reports')
if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true })
writeFileSync(
  join(reportsDir, 'i18n.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), bundleKeys, tCallSites: translated, translatable: inPlace, remaining, percent: pct, files: rows }, null, 2)}
`,
  'utf-8',
)

console.log(
  `i18n coverage — ${inPlace} translatable (${bundleKeys} in the bundle, ${translated} t() sites), ` +
    `${remaining} still literal (${pct}%)
`,
)
console.log('Largest remaining, in the order worth doing them:')
for (const row of rows.filter(r => r.remaining > 0).slice(0, 12)) {
  console.log(`  ${String(row.remaining).padStart(4)}  ${row.file}`)
}
console.log('\nReport written to reports/i18n.json')
