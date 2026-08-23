import { describe, expect, it } from 'vitest'
import { LIMITS, RateLimiter } from './rate-limit'

/** A clock the test drives, so no case has to wait for real time to pass. */
function fakeClock(start = 0) {
  let now = start
  return { now: () => now, advance: (ms: number) => (now += ms) }
}

describe('RateLimiter', () => {
  const limit = { max: 3, windowMs: 1000 }

  it('allows calls up to the limit', () => {
    const clock = fakeClock()
    const limiter = new RateLimiter(clock.now)
    for (let i = 0; i < 3; i++) expect(limiter.check('file:save', limit)).toBeNull()
  })

  it('refuses the call after the limit, and says why', () => {
    const clock = fakeClock()
    const limiter = new RateLimiter(clock.now)
    for (let i = 0; i < 3; i++) limiter.check('file:save', limit)

    const refusal = limiter.check('file:save', limit)
    expect(refusal).not.toBeNull()
    expect(refusal).toContain('file:save')
    expect(refusal).toContain('3')
  })

  it('lets calls through again once the window rolls over', () => {
    const clock = fakeClock()
    const limiter = new RateLimiter(clock.now)
    for (let i = 0; i < 4; i++) limiter.check('file:save', limit)
    expect(limiter.check('file:save', limit)).not.toBeNull()

    clock.advance(1001)
    expect(limiter.check('file:save', limit)).toBeNull()
  })

  it('counts each channel separately', () => {
    const clock = fakeClock()
    const limiter = new RateLimiter(clock.now)
    for (let i = 0; i < 4; i++) limiter.check('file:save', limit)

    expect(limiter.check('file:save', limit)).not.toBeNull()
    expect(limiter.check('file:open', limit)).toBeNull()
  })

  it('gives every privileged channel a limit', () => {
    for (const channel of ['file:save', 'file:open', 'assistant:probe', 'assistant:chat']) {
      expect(LIMITS[channel]).toBeDefined()
    }
  })

  it('sets limits well above what a person can produce', () => {
    for (const [channel, configured] of Object.entries(LIMITS)) {
      expect(configured.max, channel).toBeGreaterThanOrEqual(20)
      expect(configured.windowMs, channel).toBeGreaterThanOrEqual(1000)
    }
  })
})
