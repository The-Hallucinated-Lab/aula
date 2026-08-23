import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Telemetry stays off.
 *
 * Aula's About box tells a timetable office that no data leaves the machine.
 * That sentence is a promise about behaviour, and the only way it stays true
 * across future changes is if the ways it could quietly stop being true are
 * asserted somewhere. These are those ways.
 */

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0' },
}))

const loadWith = async (dsn: string) => {
  vi.resetModules()
  vi.doMock('../config/env', () => ({
    env: { AULA_TELEMETRY_DSN: dsn, VITE_DEV_SERVER_URL: undefined },
    isDev: false,
  }))
  return import('./index')
}

/** Fails the test if the SDK is loaded at all. */
const forbidSdk = () => {
  vi.doMock('@sentry/electron/main', () => {
    throw new Error('the Sentry SDK was imported when telemetry should have been off')
  })
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('with no DSN configured — the default build', () => {
  it('is inactive', async () => {
    forbidSdk()
    const { initTelemetry } = await loadWith('')
    const t = await initTelemetry(() => true)
    expect(t.active).toBe(false)
  })

  it('does not load the SDK, even when consent was given', async () => {
    // Consent is not the gate here. With nowhere to send a report, there is
    // nothing to load and nothing to send.
    forbidSdk()
    const { initTelemetry } = await loadWith('')
    await expect(initTelemetry(() => true)).resolves.toMatchObject({ active: false })
  })

  it('accepts a capture call and does nothing with it', async () => {
    const { initTelemetry } = await loadWith('')
    const t = await initTelemetry(() => true)
    expect(() => t.capture({ kind: 'test', reason: 'test' })).not.toThrow()
    await expect(t.close()).resolves.toBeUndefined()
  })
})

describe('with a DSN but no consent', () => {
  it('stays inactive', async () => {
    forbidSdk()
    const { initTelemetry } = await loadWith('https://key@example.invalid/1')
    const t = await initTelemetry(() => false)
    expect(t.active).toBe(false)
  })

  it('does not load the SDK', async () => {
    // A DSN set by an administrator is permission to *ask*, not the answer.
    forbidSdk()
    const { initTelemetry } = await loadWith('https://key@example.invalid/1')
    await expect(initTelemetry(() => false)).resolves.toMatchObject({ active: false })
  })
})

describe('when the SDK cannot start', () => {
  it('carries on without telemetry rather than failing the launch', async () => {
    vi.doMock('@sentry/electron/main', () => {
      throw new Error('module not installed')
    })
    const { initTelemetry } = await loadWith('https://key@example.invalid/1')
    const t = await initTelemetry(() => true)
    expect(t.active).toBe(false)
  })
})

describe('what a report is allowed to contain', () => {
  it('sends versions and a reason, and nothing about the institution', async () => {
    const captured: unknown[] = []
    vi.doMock('@sentry/electron/main', () => ({
      init: vi.fn(),
      captureEvent: (e: unknown) => captured.push(e),
      close: async () => true,
    }))
    const { initTelemetry } = await loadWith('https://key@example.invalid/1')
    const t = await initTelemetry(() => true)
    expect(t.active).toBe(true)

    t.capture({ kind: 'render-process-gone', reason: 'crashed', exitCode: 133 })

    const wire = JSON.stringify(captured)
    expect(wire).toContain('render-process-gone')
    expect(wire).toContain('1.0.0')
    // A crash report must never be a way to learn who the customer is.
    for (const leak of ['hostname', 'username', 'C:\\\\', 'cohort', 'CSE', 'timetable']) {
      expect(wire.toLowerCase()).not.toContain(leak.toLowerCase())
    }
  })

  it('truncates a reason rather than shipping an arbitrarily long string', async () => {
    const captured: { extra?: { reason?: string } }[] = []
    vi.doMock('@sentry/electron/main', () => ({
      init: vi.fn(),
      captureEvent: (e: { extra?: { reason?: string } }) => captured.push(e),
      close: async () => true,
    }))
    const { initTelemetry } = await loadWith('https://key@example.invalid/1')
    const t = await initTelemetry(() => true)

    t.capture({ kind: 'x', reason: 'y'.repeat(10_000) })
    expect(captured[0]?.extra?.reason?.length).toBeLessThanOrEqual(2000)
  })
})

describe('the consent prompt', () => {
  it('says what is sent and what is not', async () => {
    const { CONSENT_COPY } = await loadWith('')
    // A consent prompt that does not say what it collects is not consent.
    expect(CONSENT_COPY.detail).toMatch(/never contains/i)
    expect(CONSENT_COPY.detail).toMatch(/timetable/i)
    expect(CONSENT_COPY.detail).toMatch(/change this later/i)
  })

  it('offers a real refusal, not a dismissal', async () => {
    const { CONSENT_COPY } = await loadWith('')
    expect(CONSENT_COPY.deny).toBeTruthy()
    expect(CONSENT_COPY.deny).not.toMatch(/later|maybe|remind/i)
  })
})
