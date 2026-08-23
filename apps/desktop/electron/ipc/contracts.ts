/**
 * IPC payload contracts.
 *
 * The renderer is the least trusted part of an Electron application: it runs
 * the largest amount of code, it is where any injected content would land, and
 * it is the only part an attacker can realistically reach. Every value that
 * crosses into the main process is therefore parsed here before a privileged
 * API sees it.
 *
 * Before this existed the handlers took their payloads as TypeScript
 * interfaces, which is a compile-time claim about a runtime value that arrives
 * over a serialisation boundary — it guarantees nothing. `payload.data` was
 * written straight to disk, `payload.filters` was handed to Electron's dialog,
 * and `payload.messages` was forwarded to a model server, all unchecked.
 */

import { z } from 'zod'

/** Nothing Aula writes is anywhere near this large; a 64 MB export is a bug. */
const MAX_FILE_BYTES = 64 * 1024 * 1024

/**
 * Windows reserves these names at any extension. A file called `CON.csv` is
 * not creatable, and the failure is an obscure OS error rather than anything
 * the user can act on.
 */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i

/**
 * A suggested filename, not a path.
 *
 * The user still confirms the real destination in a native save dialog, so
 * this cannot by itself write anywhere unexpected. It is constrained anyway:
 * the suggestion is what pre-fills that dialog, and `../../../.bashrc` sitting
 * in the filename box is a social-engineering surface, not a technical one.
 */
const SuggestedName = z
  .string()
  .min(1)
  .max(180)
  .refine(name => !name.includes('/') && !name.includes('\\'), 'must not contain a path separator')
  .refine(name => !name.includes('\0'), 'must not contain a null byte')
  .refine(name => name !== '.' && name !== '..', 'must be a filename')
  .refine(name => !WINDOWS_RESERVED.test(name), 'is a reserved device name on Windows')

/** A dialog file-type filter. Extensions are bare, no dot, alphanumeric. */
const Filter = z.object({
  name: z.string().min(1).max(60),
  extensions: z
    .array(
      z
        .string()
        .min(1)
        .max(16)
        .regex(/^[a-zA-Z0-9]+$/, 'must be a bare extension with no dot'),
    )
    .min(1)
    .max(12),
})

const Filters = z.array(Filter).min(1).max(12)

export const SaveRequest = z.object({
  suggestedName: SuggestedName,
  data: z.string().max(MAX_FILE_BYTES),
  filters: Filters,
})
export type SaveRequest = z.infer<typeof SaveRequest>

export const OpenRequest = Filters
export type OpenRequest = z.infer<typeof OpenRequest>

/**
 * An Ollama model tag: `family:tag`, optionally namespaced.
 *
 * Constrained because the value is interpolated into a request body sent to a
 * local server. The character class rules out anything that could be read as
 * structure by a lenient parser on the other side.
 */
const ModelName = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9._/-]+(:[a-zA-Z0-9._-]+)?$/, 'is not a valid model name')

/**
 * Caps on a single chat turn.
 *
 * The briefing is the largest message and grows with the institution, so the
 * per-message ceiling is generous. The point is that it exists: without one, a
 * runaway renderer can drive the local model into swap.
 */
const MAX_MESSAGES = 32
const MAX_MESSAGE_CHARS = 256 * 1024

export const ChatRequest = z.object({
  requestId: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  model: ModelName,
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string().max(MAX_MESSAGE_CHARS),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES),
})
export type ChatRequest = z.infer<typeof ChatRequest>

export const RequestId = z.number().int().nonnegative()

/** The shape every validated handler returns when the payload is refused. */
export interface Refusal {
  ok: false
  error: string
}

/**
 * Parse an IPC payload, or describe why it was refused.
 *
 * Returns a discriminated result rather than throwing: an `ipcMain.handle`
 * that throws sends a stack trace back to the renderer, and the renderer is
 * the side we do not trust.
 */
export function parsePayload<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  what: string,
): { ok: true; value: T } | Refusal {
  const parsed = schema.safeParse(payload)
  if (parsed.success) return { ok: true, value: parsed.data }

  const first = parsed.error.issues[0]
  const where = first?.path.join('.')
  const detail = first ? `${where ? `${where} ` : ''}${first.message}` : 'unrecognised shape'
  return { ok: false, error: `Refused ${what}: ${detail}` }
}
