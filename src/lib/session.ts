import type { SessionPlanV1, TimerMode } from '../types'
import { MINUTE_MS } from './timer'

export const SIXTY_MINUTE_DURATION_MS = 60 * MINUTE_MS
export const DEFAULT_CUSTOM_DURATION_MINUTES = 35
export const MIN_CUSTOM_DURATION_MINUTES = 5
export const MAX_CUSTOM_DURATION_MINUTES = 180

export const DEFAULT_SESSION_PLAN: Readonly<SessionPlanV1> = Object.freeze({
  version: 1,
  choice: 'sixty',
  customMode: 'duration',
  customDurationMinutes: DEFAULT_CUSTOM_DURATION_MINUTES,
})

export type ResolvedSessionPlan =
  | {
      kind: 'timer'
      mode: TimerMode
      durationMs: number | null
    }
  | {
      kind: 'pomodoro'
    }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isValidCustomDuration = (minutes: unknown): minutes is number =>
  typeof minutes === 'number'
  && Number.isInteger(minutes)
  && minutes >= MIN_CUSTOM_DURATION_MINUTES
  && minutes <= MAX_CUSTOM_DURATION_MINUTES

export function isSessionPlan(value: unknown): value is SessionPlanV1 {
  if (!isObject(value)) return false

  return value.version === 1
    && (value.choice === 'sixty' || value.choice === 'endless' || value.choice === 'custom')
    && (value.customMode === 'duration' || value.customMode === 'pomodoro')
    && isValidCustomDuration(value.customDurationMinutes)
}

export function createSessionPlan(
  overrides: Partial<Omit<SessionPlanV1, 'version'>> = {},
): SessionPlanV1 {
  const plan: SessionPlanV1 = {
    ...DEFAULT_SESSION_PLAN,
    ...overrides,
  }

  if (!isSessionPlan(plan)) {
    throw new RangeError('Session plans require a valid choice, custom mode, and 5–180 minute custom duration.')
  }

  return plan
}

export function resolveSessionPlan(plan: SessionPlanV1): ResolvedSessionPlan {
  if (!isSessionPlan(plan)) {
    throw new RangeError('Cannot resolve an invalid session plan.')
  }

  if (plan.choice === 'sixty') {
    return { kind: 'timer', mode: 'countdown', durationMs: SIXTY_MINUTE_DURATION_MS }
  }

  if (plan.choice === 'endless') {
    return { kind: 'timer', mode: 'endless', durationMs: null }
  }

  if (plan.customMode === 'pomodoro') {
    return { kind: 'pomodoro' }
  }

  return {
    kind: 'timer',
    mode: 'countdown',
    durationMs: plan.customDurationMinutes * MINUTE_MS,
  }
}
