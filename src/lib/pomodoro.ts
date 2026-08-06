import type {
  PomodoroConfig,
  PomodoroPhase,
  PomodoroSnapshot,
  PomodoroState,
  PomodoroTransition,
  RestoredPomodoroSession,
} from '../types'
import {
  MINUTE_MS,
  completeTimer,
  createTimerState,
  getTimerSnapshot,
  pauseTimer,
  resumeTimer,
  startTimer,
} from './timer'

export const POMODORO_LIMITS = Object.freeze({
  workMinutes: Object.freeze({ minimum: 1, maximum: 180 }),
  shortBreakMinutes: Object.freeze({ minimum: 1, maximum: 120 }),
  longBreakMinutes: Object.freeze({ minimum: 1, maximum: 120 }),
  focusSessionsBeforeLongBreak: Object.freeze({ minimum: 1, maximum: 12 }),
})

export const DEFAULT_POMODORO_CONFIG: Readonly<PomodoroConfig> = Object.freeze({
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  focusSessionsBeforeLongBreak: 4,
})

export const POMODORO_PHASE_LABELS: Readonly<Record<PomodoroPhase, string>> = Object.freeze({
  focus: 'Focus',
  'short-break': 'Short break',
  'long-break': 'Long break',
})

const isIntegerInRange = (
  value: unknown,
  range: { readonly minimum: number; readonly maximum: number },
): value is number => typeof value === 'number'
  && Number.isInteger(value)
  && value >= range.minimum
  && value <= range.maximum

export function isPomodoroConfig(value: unknown): value is PomodoroConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false

  const config = value as Record<string, unknown>
  return isIntegerInRange(config.workMinutes, POMODORO_LIMITS.workMinutes)
    && isIntegerInRange(config.shortBreakMinutes, POMODORO_LIMITS.shortBreakMinutes)
    && isIntegerInRange(config.longBreakMinutes, POMODORO_LIMITS.longBreakMinutes)
    && isIntegerInRange(
      config.focusSessionsBeforeLongBreak,
      POMODORO_LIMITS.focusSessionsBeforeLongBreak,
    )
}

const requireConfig = (config: PomodoroConfig) => {
  if (!isPomodoroConfig(config)) {
    throw new RangeError('Pomodoro settings must use whole minutes within the supported ranges.')
  }
}

export function getPomodoroPhaseDurationMs(
  config: PomodoroConfig,
  phase: PomodoroPhase,
): number {
  requireConfig(config)

  if (phase === 'focus') return config.workMinutes * MINUTE_MS
  if (phase === 'short-break') return config.shortBreakMinutes * MINUTE_MS
  return config.longBreakMinutes * MINUTE_MS
}

const createPhaseTimer = (config: PomodoroConfig, phase: PomodoroPhase) =>
  createTimerState('countdown', getPomodoroPhaseDurationMs(config, phase))

export function createPomodoroState(
  config: PomodoroConfig = { ...DEFAULT_POMODORO_CONFIG },
): PomodoroState {
  requireConfig(config)
  const savedConfig = { ...config }

  return {
    version: 1,
    config: savedConfig,
    phase: 'focus',
    completedFocusSessions: 0,
    focusSessionsInCycle: 0,
    timer: createPhaseTimer(savedConfig, 'focus'),
  }
}

export function resetPomodoro(
  state: PomodoroState,
  config: PomodoroConfig = state.config,
): PomodoroState {
  return createPomodoroState(config)
}

export function configurePomodoro(
  state: PomodoroState,
  config: PomodoroConfig,
): PomodoroState {
  return resetPomodoro(state, config)
}

export function advancePomodoroPhase(state: PomodoroState): PomodoroState {
  if (state.timer.status !== 'completed') return state

  if (state.phase === 'focus') {
    const completedFocusSessions = state.completedFocusSessions + 1
    const focusSessionsInCycle = state.focusSessionsInCycle + 1
    const longBreakDue = focusSessionsInCycle >= state.config.focusSessionsBeforeLongBreak
    const phase: PomodoroPhase = longBreakDue ? 'long-break' : 'short-break'

    return {
      ...state,
      phase,
      completedFocusSessions,
      focusSessionsInCycle,
      timer: createPhaseTimer(state.config, phase),
    }
  }

  const completedLongBreak = state.phase === 'long-break'
  return {
    ...state,
    phase: 'focus',
    focusSessionsInCycle: completedLongBreak ? 0 : state.focusSessionsInCycle,
    timer: createPhaseTimer(state.config, 'focus'),
  }
}

export function startPomodoro(state: PomodoroState, now: number): PomodoroState {
  const readyState = state.timer.status === 'completed'
    ? advancePomodoroPhase(state)
    : state

  return {
    ...readyState,
    timer: startTimer(readyState.timer, now),
  }
}

export function pausePomodoro(state: PomodoroState, now: number): PomodoroState {
  return {
    ...state,
    timer: pauseTimer(state.timer, now),
  }
}

export function resumePomodoro(state: PomodoroState, now: number): PomodoroState {
  return {
    ...state,
    timer: resumeTimer(state.timer, now),
  }
}

export function completePomodoroPhase(state: PomodoroState, now: number): PomodoroState {
  return {
    ...state,
    timer: completeTimer(state.timer, now),
  }
}

export function reconcilePomodoroState(
  state: PomodoroState,
  now: number,
): PomodoroTransition {
  const snapshot = getTimerSnapshot(state.timer, now)
  if (state.timer.status !== 'running' || snapshot.status !== 'completed') {
    return { state, completedPhase: null, advanced: false }
  }

  const completedPhase = state.phase
  const completedState = completePomodoroPhase(state, now)
  return {
    state: advancePomodoroPhase(completedState),
    completedPhase,
    advanced: true,
  }
}

export function getPomodoroSnapshot(state: PomodoroState, now: number): PomodoroSnapshot {
  const target = state.config.focusSessionsBeforeLongBreak
  const focusSessionNumber = state.phase === 'long-break'
    ? target
    : Math.min(state.focusSessionsInCycle + 1, target)

  return {
    phase: state.phase,
    phaseLabel: POMODORO_PHASE_LABELS[state.phase],
    focusSessionNumber,
    focusSessionsBeforeLongBreak: target,
    completedFocusSessions: state.completedFocusSessions,
    timer: getTimerSnapshot(state.timer, now),
  }
}

export function restorePomodoroState(
  state: PomodoroState,
  now: number,
): RestoredPomodoroSession {
  const reconciled = reconcilePomodoroState(state, now)
  if (reconciled.advanced) {
    return {
      state: reconciled.state,
      requiresResume: false,
      completedPhase: reconciled.completedPhase,
    }
  }

  if (state.timer.status !== 'running') {
    return { state, requiresResume: false, completedPhase: null }
  }

  return {
    state: pausePomodoro(state, now),
    requiresResume: true,
    completedPhase: null,
  }
}
