#!/usr/bin/env node
/**
 * Every `npm run X` inside a package script must resolve to a real script.
 *
 * This exists because of a specific failure. `apps/desktop`'s `package` script
 * called `npm run audit:licenses --workspace-root`. That flag belongs to
 * `npm install`, not `npm run`; npm ignored it with a warning and looked for
 * the script inside `apps/desktop`, where it does not exist. The job that would
 * have caught it only runs on `main`, so the pull request was green and the
 * merge was not.
 *
 * The class deserves its own check. A script referring to a script that is not
 * there is a typo the shell reports only when it runs, and some of these run
 * rarely and expensively — `npm run package` downloads ~100 MB of Electron
 * before it gets far enough to fail.
 *
 * This resolves the whole graph statically, from the manifests, in milliseconds.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = path => JSON.parse(readFileSync(path, 'utf-8'))

const root = read(join(repoRoot, 'package.json'))

/** Every workspace manifest, keyed by the name other scripts address it by. */
const packages = new Map([['(root)', root]])

for (const pattern of root.workspaces ?? []) {
  const baseDir = join(repoRoot, pattern.replace(/\/\*$/, ''))
  if (!existsSync(baseDir)) continue
  for (const entry of readdirSync(baseDir)) {
    const dir = join(baseDir, entry)
    if (!statSync(dir).isDirectory()) continue
    const manifest = join(dir, 'package.json')
    // A directory without a manifest is not a workspace, which is how
    // `tools/orchestrator` and `tools/scripts` sit under `tools/*`.
    if (!existsSync(manifest)) continue
    const pkg = read(manifest)
    packages.set(pkg.name, pkg)
  }
}

/**
 * `npm run <name>` and the rest of that command.
 *
 * The tail runs to the next `&&`, `||`, `;` or newline rather than matching a
 * list of flags, because a flag's *value* is not a flag: `--workspace
 * @aula/desktop` is two tokens, and a flags-only pattern drops the second —
 * which made every delegating script look like it targeted a nameless package.
 */
const NPM_RUN = /\bnpm\s+run\s+([A-Za-z0-9:_-]+)([^&|;\n]*)/g

/**
 * Flags that exist for other npm commands and are silently ignored by
 * `npm run`. Each one is a way to think a script runs somewhere it does not.
 */
const IGNORED_BY_NPM_RUN = new Set([
  '--workspace-root',
  '--include-workspace-root',
  '--omit',
  '--save',
  '--save-dev',
  '--save-exact',
  '--no-save',
])

const problems = []

for (const [name, manifest] of packages) {
  for (const [scriptName, body] of Object.entries(manifest.scripts ?? {})) {
    for (const match of String(body).matchAll(NPM_RUN)) {
      const target = match[1]
      const flags = (match[2] ?? '').trim().split(/\s+/).filter(Boolean)

      for (const flag of flags) {
        const bare = flag.split('=')[0]
        if (!IGNORED_BY_NPM_RUN.has(bare)) continue
        problems.push(
          `${name} → "${scriptName}": \`npm run ${target} ${bare}\` — \`${bare}\` is not a ` +
            `flag \`npm run\` understands. npm ignores it with a warning and then looks ` +
            `for "${target}" in ${name}.`,
        )
      }

      // `--workspaces` fans out; `--if-present` means absence is intentional.
      if (flags.includes('--workspaces') || flags.includes('--if-present')) continue

      // Where should the target script live?
      let owner = name
      const index = flags.findIndex(
        f => f === '--workspace' || f === '-w' || f.startsWith('--workspace='),
      )
      if (index !== -1) {
        const flag = flags[index]
        owner = flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : (flags[index + 1] ?? '')
      }

      const pkg = packages.get(owner)
      if (!pkg) {
        problems.push(`${name} → "${scriptName}": no workspace named "${owner}"`)
        continue
      }
      if (!(target in (pkg.scripts ?? {}))) {
        problems.push(
          `${name} → "${scriptName}": \`npm run ${target}\` but ${owner} has no "${target}" script`,
        )
      }
    }
  }
}

const scriptCount = [...packages.values()].reduce(
  (n, p) => n + Object.keys(p.scripts ?? {}).length,
  0,
)

if (problems.length > 0) {
  console.error(`\nScript graph is broken (${problems.length}):\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('')
  process.exit(1)
}

console.log(
  `Script graph OK — ${scriptCount} scripts across ${packages.size} packages, every reference resolves.`,
)
