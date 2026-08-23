/**
 * Immutable update helpers for configuration lists.
 *
 * Both of these exist because the obvious spread has a failure mode that is
 * silent rather than loud.
 */

/**
 * Replace one entry of a list, merging a patch into it.
 *
 * The list is returned unchanged when the index is out of range. Written out
 * as `next[i] = { ...next[i], ...patch }`, a stale index — a row deleted
 * between render and click — instead *appends* an object made only of the
 * patched keys. That object has no id, so it survives as far as validation
 * and fails there, naming the wrong problem.
 */
export function patchAt<T extends object>(
  list: readonly T[],
  index: number,
  patch: Partial<T>,
): T[] {
  const current = list[index]
  if (current === undefined) return [...list]
  const next = [...list]
  next[index] = { ...current, ...patch }
  return next
}

/** A patch that may also clear an optional field. */
export type Clearable<T> = { [K in keyof T]?: T[K] | undefined }

/**
 * Apply a patch, treating an explicit `undefined` as "remove this key".
 *
 * Under `exactOptionalPropertyTypes` an optional field and a field set to
 * `undefined` are different states, and only the first is valid. Spreading
 * would produce the second; deleting produces the first, which is what
 * "the user cleared this" actually means.
 */
export function applyPatch<T extends object>(current: T, patch: Clearable<T>): T {
  const next: T = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key as keyof T]
    else Object.assign(next, { [key]: value })
  }
  return next
}
