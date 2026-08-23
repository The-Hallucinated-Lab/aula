#!/usr/bin/env node
/**
 * Point Git at the tracked hook directory.
 *
 * `core.hooksPath` is Git's own mechanism, so the hooks are plain executables
 * under version control with no wrapper package in the dependency tree. Run by
 * `npm install` through the root `prepare` script.
 *
 * A missing or non-Git checkout is not an error: a tarball consumer should not
 * fail to install because it has no `.git`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

if (!existsSync(join(repoRoot, '.git'))) {
  console.log('[hooks] no .git directory — skipping hook installation')
  process.exit(0)
}

if (process.env.CI === 'true' || process.env.AULA_SKIP_HOOKS === '1') {
  console.log('[hooks] CI or AULA_SKIP_HOOKS set — skipping hook installation')
  process.exit(0)
}

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  console.log('[hooks] core.hooksPath -> .githooks')
} catch (error) {
  // A hook installer must never be the reason an install fails.
  console.warn('[hooks] could not set core.hooksPath:', error.message)
}
