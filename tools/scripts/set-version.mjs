#!/usr/bin/env node
/**
 * Stamp a version across every workspace manifest.
 *
 * Called by semantic-release during `prepare`, before the release commit is
 * made. `npm version` is not used: it would create its own tag and commit,
 * which is exactly the job semantic-release is doing.
 *
 * All packages move together. They are released as one application, and a
 * `@aula/core` at 2.1.0 inside a `@aula/desktop` at 2.3.0 would invite the
 * question of which one the installer is — a question with no answer, because
 * nothing is published separately.
 *
 *   node tools/scripts/set-version.mjs 1.4.0
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const MANIFESTS = [
  'package.json',
  'packages/core/package.json',
  'apps/desktop/package.json',
  'tools/cli/package.json',
]

const version = process.argv[2]

if (!version) {
  console.error('usage: set-version.mjs <version>')
  process.exit(1)
}

// Semver, without the range syntax a manifest must never carry as its own
// version. A malformed value here would ship in the installer's file metadata.
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?(\+[0-9A-Za-z-.]+)?$/.test(version)) {
  console.error(`set-version: "${version}" is not a semantic version`)
  process.exit(1)
}

let changed = 0

for (const relative of MANIFESTS) {
  const path = join(repoRoot, relative)
  // A manifest that does not exist yet is not an error — the workspace list
  // is allowed to grow between releases.
  if (!existsSync(path)) continue

  const raw = readFileSync(path, 'utf-8')
  const manifest = JSON.parse(raw)
  if (manifest.version === version) continue

  manifest.version = version
  // Two spaces and a trailing newline, which is what npm writes and what
  // Prettier expects — otherwise the release commit fails the format gate.
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
  console.log(`  ${relative}  ->  ${version}`)
  changed += 1
}

console.log(`set-version: ${version} written to ${changed} manifest(s)`)
