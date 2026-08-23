#!/usr/bin/env node
/**
 * Dependency licence gate.
 *
 * Aula ships as a compiled desktop binary that statically links its whole
 * dependency graph, so a strong-copyleft runtime dependency would place the
 * application itself under that licence. This script fails the build on one.
 *
 * The distinction that matters is runtime vs build-time:
 *   - `dependencies`      linked into the shipped artefact  -> strict
 *   - `devDependencies`   used to produce it, never shipped -> permissive
 *
 * Reads the installed tree via `npm ls --json`, so it audits what is actually
 * resolved rather than what the manifests ask for.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Licences that would relicense a statically linked application. */
const FORBIDDEN_IN_RUNTIME = [
  'GPL-1.0',
  'GPL-2.0',
  'GPL-3.0',
  'AGPL-1.0',
  'AGPL-3.0',
  'LGPL-2.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'SSPL-1.0',
  'BUSL-1.1',
  'CPAL-1.0',
  'OSL-3.0',
  'EUPL-1.2',
]

/** File-level copyleft: safe to link, but the notice obligation is real. */
const REPORT_ONLY = ['MPL-2.0', 'CDDL-1.0', 'CDDL-1.1', 'EPL-1.0', 'EPL-2.0']

const normalise = id =>
  String(id ?? 'UNKNOWN')
    .replace(/[()]/g, '')
    .trim()

const isForbidden = id => {
  const text = normalise(id).toUpperCase()
  // "MIT OR GPL-2.0" is satisfiable under MIT, so a disjunction is only
  // forbidden when every branch is.
  const branches = text.split(/\s+OR\s+/).map(s => s.trim())
  return branches.every(branch =>
    FORBIDDEN_IN_RUNTIME.some(
      bad =>
        branch.includes(bad.toUpperCase()) &&
        !branch.includes(`${bad.toUpperCase()}-OR-LATER-EXCEPTION`),
    ),
  )
}

function readTree(prodOnly) {
  const args = ['ls', '--all', '--json', '--long', '--workspaces', '--include-workspace-root']
  if (prodOnly) args.push('--omit=dev')
  // Run npm's CLI through the current Node binary rather than resolving `npm`
  // on PATH. `shell: true` would concatenate arguments into a command line
  // without escaping them — a command-injection surface for no benefit — and
  // Node refuses to exec `npm.cmd` directly on Windows without it.
  // `npm_execpath` is set for every script npm runs.
  const npmCli = process.env.npm_execpath
  const [command, prefix] = npmCli
    ? [process.execPath, [npmCli]]
    : [process.platform === 'win32' ? 'npm.cmd' : 'npm', []]

  const raw = execFileSync(command, [...prefix, ...args], {
    cwd: repoRoot,
    encoding: 'utf-8',
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return JSON.parse(raw)
}

function collect(node, out = new Map()) {
  for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
    if (dep.resolved === undefined && dep.version === undefined) continue
    const key = `${name}@${dep.version ?? '?'}`
    if (!out.has(key)) {
      out.set(key, {
        name,
        version: dep.version ?? '?',
        license: normalise(dep.license ?? readLicenseFromDisk(dep.path)),
        path: dep.path ?? '',
      })
    }
    collect(dep, out)
  }
  return out
}

function readLicenseFromDisk(pkgPath) {
  if (!pkgPath) return 'UNKNOWN'
  try {
    const pkg = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf-8'))
    if (typeof pkg.license === 'string') return pkg.license
    if (pkg.license?.type) return pkg.license.type
    if (Array.isArray(pkg.licenses)) return pkg.licenses.map(l => l.type ?? l).join(' OR ')
  } catch {
    // An unreadable manifest is reported as UNKNOWN, never silently skipped.
  }
  return 'UNKNOWN'
}

const WORKSPACE_NAMES = new Set(['@aula/core', '@aula/desktop', 'aula-workspace'])

const runtime = collect(readTree(true))
const everything = collect(readTree(false))

const violations = []
const notices = []
const unknown = []

for (const entry of runtime.values()) {
  if (WORKSPACE_NAMES.has(entry.name)) continue
  if (isForbidden(entry.license)) violations.push(entry)
  else if (REPORT_ONLY.some(l => entry.license.toUpperCase().includes(l.toUpperCase())))
    notices.push(entry)
  else if (entry.license === 'UNKNOWN') unknown.push(entry)
}

const tally = new Map()
for (const entry of everything.values()) {
  if (WORKSPACE_NAMES.has(entry.name)) continue
  tally.set(entry.license, (tally.get(entry.license) ?? 0) + 1)
}

const report = {
  generatedAt: new Date().toISOString(),
  runtimePackages: runtime.size,
  totalPackages: everything.size,
  distribution: Object.fromEntries([...tally.entries()].sort((a, b) => b[1] - a[1])),
  violations,
  fileLevelCopyleftNotices: notices,
  unknown,
}

const reportsDir = join(repoRoot, 'reports')
if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true })
writeFileSync(join(reportsDir, 'licenses.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8')

console.log(`Licence audit — ${runtime.size} runtime / ${everything.size} total packages`)
for (const [license, count] of report.distribution ? Object.entries(report.distribution) : []) {
  console.log(`  ${String(count).padStart(4)}  ${license}`)
}

if (notices.length) {
  console.log('\nFile-level copyleft (safe to link, notice obligation applies):')
  for (const n of notices) console.log(`  ${n.name}@${n.version} — ${n.license}`)
}

if (unknown.length) {
  console.log('\nNo licence declared (review manually):')
  for (const u of unknown) console.log(`  ${u.name}@${u.version}`)
}

if (violations.length) {
  console.error('\nFAIL — strong copyleft in the shipped dependency graph:')
  for (const v of violations) console.error(`  ${v.name}@${v.version} — ${v.license}`)
  console.error('\nAula links its dependencies into a distributed binary; these licences would')
  console.error('extend to the application itself. Replace them or move them to devDependencies.')
  process.exit(1)
}

console.log('\nPASS — no strong-copyleft licence in the shipped dependency graph.')
console.log('Report written to reports/licenses.json')
