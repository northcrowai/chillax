import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SESSION_PLAN,
  createSessionPlan,
  isSessionPlan,
  resolveSessionPlan,
} from './session'

const MINUTE = 60_000

describe('session plan', () => {
  it('defaults to a 60-minute session', () => {
    const plan = createSessionPlan()

    expect(plan).toEqual(DEFAULT_SESSION_PLAN)
    expect(resolveSessionPlan(plan)).toEqual({
      kind: 'timer',
      mode: 'countdown',
      durationMs: 60 * MINUTE,
    })
  })

  it('resolves endless, custom duration, and Pomodoro choices', () => {
    expect(resolveSessionPlan(createSessionPlan({ choice: 'endless' }))).toEqual({
      kind: 'timer',
      mode: 'endless',
      durationMs: null,
    })
    expect(resolveSessionPlan(createSessionPlan({
      choice: 'custom',
      customMode: 'duration',
      customDurationMinutes: 42,
    }))).toEqual({
      kind: 'timer',
      mode: 'countdown',
      durationMs: 42 * MINUTE,
    })
    expect(resolveSessionPlan(createSessionPlan({
      choice: 'custom',
      customMode: 'pomodoro',
    }))).toEqual({ kind: 'pomodoro' })
  })

  it('rejects out-of-range and malformed plans', () => {
    expect(isSessionPlan({ ...DEFAULT_SESSION_PLAN, customDurationMinutes: 4 })).toBe(false)
    expect(isSessionPlan({ ...DEFAULT_SESSION_PLAN, choice: 'later' })).toBe(false)
    expect(() => createSessionPlan({ customDurationMinutes: 181 })).toThrow(RangeError)
  })
})
