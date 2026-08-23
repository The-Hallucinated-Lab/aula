/**
 * Environment contract for the main process.
 *
 * Read once at startup and validated eagerly. The alternative — reading
 * `process.env` at each point of use — turns a typo in a config file into a
 * behaviour change three screens deep instead of a named error at launch.
 *
 * Every variable is optional; the defaults here are the supported
 * configuration. `.env.example` documents them for humans.
 */

import { z } from 'zod'

/**
 * Loopback-only guard for the assistant endpoint.
 *
 * Aula's promise is that institutional data never leaves the machine. That
 * promise is worth exactly as much as the weakest way to change the
 * destination, so a remote host is rejected at parse time rather than trusted
 * because it came from a local file.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

const loopbackUrl = z
  .string()
  .trim()
  .refine(value => {
    try {
      const url = new URL(value)
      return (
        (url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK_HOSTS.has(url.hostname)
      )
    } catch {
      return false
    }
  }, 'must be an http(s) URL on a loopback host (localhost, 127.0.0.1 or ::1)')
  .transform(value => new URL(value).origin)

const boolish = z
  .enum(['0', '1', 'true', 'false', 'yes', 'no'])
  .transform(value => value === '1' || value === 'true' || value === 'yes')

const intIn = (min: number, max: number) => z.coerce.number().int().min(min).max(max)

const EnvSchema = z.object({
  AULA_ASSISTANT_BASE_URL: loopbackUrl.default('http://127.0.0.1:11434'),
  AULA_ASSISTANT_TIMEOUT_MS: intIn(250, 30_000).default(2500),
  AULA_ASSISTANT_NUM_CTX: intIn(512, 131_072).default(8192),
  AULA_ASSISTANT_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  AULA_ASSISTANT_DISABLED: boolish.default(false),
  AULA_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  AULA_TELEMETRY_DSN: z.string().trim().default(''),
  VITE_DEV_SERVER_URL: z.string().url().optional(),
})

export type AulaEnv = z.infer<typeof EnvSchema>

/**
 * Strip empty strings before validation.
 *
 * An unset variable and a variable set to `""` mean the same thing to a
 * `.env` file but not to Zod: without this, `AULA_LOG_LEVEL=` would fail the
 * enum instead of falling back to the default.
 */
function present(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && value.trim() !== '') out[key] = value
  }
  return out
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AulaEnv {
  const parsed = EnvSchema.safeParse(present(source))
  if (parsed.success) return parsed.data

  const detail = parsed.error.issues
    .map(issue => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  throw new Error(`Invalid Aula environment configuration:\n${detail}`)
}

/** The validated environment. Importing this module is what performs the check. */
export const env: AulaEnv = loadEnv()

export const isDev = env.VITE_DEV_SERVER_URL !== undefined
