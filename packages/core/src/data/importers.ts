/**
 * CSV import — the seam where real institutional data replaces generated data.
 *
 * The generator turns figures into an institution; that is what makes a new
 * project usable in a minute. It is not what anybody wants once they have a
 * roster. `EntityOverrides` already means "explicit records take over and the
 * generator stops inventing this type" (D-22), so an import is that same
 * mechanism fed from a file instead of from an edit, and it inherits the whole
 * validation, editing and reset-to-generated path unchanged.
 */

export * from './importers/kit'
export * from './importers/staff'
export * from './importers/rooms'
export * from './importers/courses'
export * from './importers/templates'
