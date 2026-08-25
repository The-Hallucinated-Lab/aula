#!/usr/bin/env node
/**
 * Prove the release configuration can actually render notes.
 *
 * `semantic-release --dry-run` looks like it does this and does not. On any
 * branch that is not a release branch it stops after loading plugins and
 * reports "a new version won't be published" — before `generateNotes` runs. So
 * a preset incompatible with the installed changelog writer passes the dry run
 * and fails on the first real release, which is exactly what happened:
 *
 *   Missing helper: "conventional-changelog-conventionalcommits requires
 *   conventional-changelog-writer@9 or newer …"
 *
 * `@semantic-release/release-notes-generator@14` depends on
 * `conventional-changelog-writer@^8`, and preset major 10 needs 9+. The two
 * are resolved independently, so nothing in the dependency tree objects — only
 * rendering does.
 *
 * This calls the generator directly with a synthetic commit of each type and
 * renders the notes. If the preset and the writer disagree, it fails here, in
 * a second, on a developer's machine.
 */

import { generateNotes } from '@semantic-release/release-notes-generator'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const releaseRc = JSON.parse(readFileSync(join(repoRoot, '.releaserc.json'), 'utf-8'))

/** The plugin's own options, taken from the real configuration. */
function optionsFor(name) {
  for (const entry of releaseRc.plugins) {
    if (Array.isArray(entry) && entry[0] === name) return entry[1]
    if (entry === name) return {}
  }
  throw new Error(`${name} is not configured in .releaserc.json`)
}

/** One commit of every type the release rules recognise, plus a breaking change. */
const commits = [
  { hash: '1'.repeat(40), message: 'feat(solver): add a bounded displacement pass' },
  { hash: '2'.repeat(40), message: 'fix(desktop): stop the dialog closing on a drag' },
  { hash: '3'.repeat(40), message: 'perf(core): avoid an allocation per candidate' },
  { hash: '4'.repeat(40), message: 'refactor: split the rule registry by subject' },
  { hash: '5'.repeat(40), message: 'docs: rewrite the README' },
  {
    hash: '6'.repeat(40),
    message:
      'feat(core)!: drop the legacy holidays field\n\n' +
      'BREAKING CHANGE: saved projects written before 1.0 lose their holiday list.',
  },
]

const context = {
  cwd: repoRoot,
  env: process.env,
  options: { repositoryUrl: 'https://github.com/The-Hallucinated-Lab/aula' },
  lastRelease: { version: '1.0.0', gitTag: 'v1.0.0' },
  nextRelease: { version: '1.1.0', gitTag: 'v1.1.0', type: 'minor' },
  commits,
  logger: { log: () => {}, error: console.error },
}

let notes
try {
  notes = await generateNotes(optionsFor('@semantic-release/release-notes-generator'), context)
} catch (error) {
  console.error('\nRelease notes could not be rendered.\n')
  console.error(error instanceof Error ? error.message : error)
  console.error(
    '\nThis is usually the changelog preset and the changelog writer disagreeing.' +
      '\nCheck the resolved versions of `conventional-changelog-conventionalcommits`' +
      '\nand `conventional-changelog-writer` — the preset major must match what' +
      '\n`@semantic-release/release-notes-generator` depends on.\n',
  )
  process.exit(1)
}

/* Rendering without throwing is necessary but not sufficient: a preset that
   silently produced nothing would also "pass". Check the sections that the
   configured `presetConfig` promises are actually present. */
const required = ['Features', 'Fixes', 'Performance', 'BREAKING']
const missing = required.filter(section => !notes.includes(section))

if (missing.length > 0) {
  console.error('\nNotes rendered, but these expected sections are absent:')
  for (const section of missing) console.error(`  ${section}`)
  console.error('\nRendered output:\n')
  console.error(notes)
  process.exit(1)
}

/* Hidden types must stay hidden, or every chore lands in the changelog. */
if (notes.includes('rewrite the README') === false) {
  console.error('\n`docs` is configured as visible but did not appear.\n')
  process.exit(1)
}

console.log('Release notes render correctly.\n')
console.log(notes.trim())
console.log('')
