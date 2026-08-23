/**
 * Writing files, and editing the places new code has to be registered.
 *
 * Two rules run through everything here.
 *
 * **Nothing is overwritten.** A generator that clobbers a file the developer
 * has already edited is worse than no generator. Every write refuses an
 * existing path and says so.
 *
 * **Registration uses anchors, not pattern matching.** A regex against
 * `const NAV = [` works until somebody reformats the array, and then it fails
 * silently — the file is written, nothing is registered, and the new page
 * simply does not appear. An explicit sentinel comment either exists or does
 * not, and its absence is an error the developer sees.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

export class GenerateError extends Error {}

export interface Change {
  path: string
  kind: 'created' | 'edited'
}

/**
 * A planned set of changes.
 *
 * Collected first and applied together, so a failure halfway through
 * validation leaves nothing on disk. `--dry-run` prints the plan instead of
 * applying it.
 */
export class Plan {
  private readonly writes = new Map<string, string>()
  private readonly root: string

  constructor(root: string) {
    this.root = root
  }

  /** Create a file. Refuses if it exists. */
  create(path: string, contents: string) {
    const full = resolve(this.root, path)
    if (existsSync(full)) {
      throw new GenerateError(
        `${relative(this.root, full)} already exists — nothing was written. ` +
          'Delete it first, or choose another name.',
      )
    }
    if (this.writes.has(full)) {
      throw new GenerateError(`${relative(this.root, full)} would be created twice`)
    }
    this.writes.set(full, contents)
  }

  /**
   * Replace an existing file wholesale.
   *
   * Distinct from `create`, which refuses an existing path. Registration
   * sometimes means rewriting a module rather than inserting a line, and the
   * two need different guards: this one refuses a path that does *not* exist,
   * so a typo cannot silently produce a new file nobody imports.
   */
  rewrite(path: string, contents: string) {
    const full = resolve(this.root, path)
    if (!existsSync(full)) {
      throw new GenerateError(`${path} does not exist — nothing to rewrite`)
    }
    this.writes.set(full, contents)
  }

  /** Read a file the plan may already have staged, or the one on disk. */
  read(path: string): string {
    const full = resolve(this.root, path)
    const staged = this.writes.get(full)
    if (staged !== undefined) return staged
    if (!existsSync(full)) throw new GenerateError(`${path} does not exist`)
    return readFileSync(full, 'utf-8')
  }

  /**
   * Insert a line above an anchor comment.
   *
   * The anchor is the contract between the generator and the file. If it is
   * missing the generator stops rather than guessing where the line should go
   * — the developer has moved or removed it, and only they know where it went.
   */
  insertBefore(path: string, anchor: string, line: string) {
    const source = this.read(path)
    if (!source.includes(anchor)) {
      throw new GenerateError(
        `${path} has no \`${anchor}\` anchor.\n` +
          '  That comment is how the CLI knows where to register new code. ' +
          'Put it back, or add the registration by hand.',
      )
    }
    if (source.includes(line.trim())) {
      // Re-running a generator after a partial failure should not produce a
      // duplicate import or a duplicate route.
      return
    }
    const at = source.indexOf(anchor)
    const lineStart = source.lastIndexOf('\n', at) + 1
    const indent = /^\s*/.exec(source.slice(lineStart, at))?.[0] ?? ''
    const full = resolve(this.root, path)
    this.writes.set(
      full,
      `${source.slice(0, lineStart)}${indent}${line.trim()}\n${source.slice(lineStart)}`,
    )
  }

  /** What this plan would do, without doing it. */
  describe(): Change[] {
    return [...this.writes.keys()].map(full => ({
      path: relative(this.root, full).replaceAll('\\', '/'),
      kind: existsSync(full) ? ('edited' as const) : ('created' as const),
    }))
  }

  apply(): Change[] {
    const changes = this.describe()
    for (const [full, contents] of this.writes) {
      mkdirSync(dirname(full), { recursive: true })
      // Always LF. `.gitattributes` normalises the repository, and a generator
      // writing CRLF makes every generated file fail the format check.
      writeFileSync(full, contents.replaceAll('\r\n', '\n'), 'utf-8')
    }
    return changes
  }
}
