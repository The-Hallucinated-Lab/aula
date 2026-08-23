/**
 * `.env` loading, without a dependency.
 *
 * Node has parsed `.env` files natively since 20.12 (`process.loadEnvFile`),
 * and Electron 43 ships Node 22, so `dotenv` would be a package in the
 * shipped bundle for something the runtime already does.
 *
 * A missing file is the normal case — Aula runs on its defaults — so absence
 * is silent. A malformed file is not: it means someone tried to configure
 * something and it did not take, which is worth a warning even though the app
 * continues on defaults.
 */

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Walk up from the bundle looking for a `.env`, stopping at the filesystem root. */
function findEnvFile(startDir: string): string | null {
  let dir = startDir
  for (;;) {
    const candidate = join(dir, '.env')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function loadDotEnv(startDir = dirname(fileURLToPath(import.meta.url))): string | null {
  const file = findEnvFile(resolve(startDir))
  if (file === null) return null

  try {
    process.loadEnvFile(file)
    return file
  } catch (error) {
    console.warn(
      `[Aula] found ${file} but could not parse it; continuing on defaults:`,
      error instanceof Error ? error.message : error,
    )
    return null
  }
}
