import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POMODORO_CONFIG,
  advancePomodoroPhase,
  completePomodoroPhase,
  configurePomodoro,
  createPomodoroState,
  getPomodoroSnapshot,
  pausePomodoro,
  reconcilePomodoroState,
  restorePomodoroState,
  resumePomodoro,
  startPomodoro,
} from './pomodoro'

const START_TIME = 1_800_000_000_000
const MINUTE = 60_000

const finishCurrentPhase = (state: ReturnType<typeof createPomodoroState>, now: number) => {
  const running = startPomodoro(state, now)
  const duration = running.timer.durationMs as number
  return reconcilePomodoroState(running, now + duration)
}

describe('Pomodoro timer domain', () => {
  it('creates the conventional 25/5/15 four-focus cycle', () => {
    const state = createPomodoroState()

    expect(state).toMatchObject({
      version: 1,
      config: DEFAULT_POMODORO_CONFIG,
      phase: 'focus',
      completedFocusSessions: 0,
      focusSessionsInCycle: 0,
      timer: {
        status: 'idle',
        durationMs: 25 * MINUTE,
      },
    })
    expect(getPomodoroSnapshot(state, START_TIME)).toMatchObject({
      phaseLabel: 'Focus',
      focusSessionNumber: 1,
      focusSessionsBeforeLongBreak: 4,
    })
  })

  it('advances to an idle short break and does not auto-start it', () => {
    const running = startPomodoro(createPomodoroState(), START_TIME)
    const beforeEnd = reconcilePomodoroState(running, START_TIME + 24 * MINUTE)
    const completed = reconcilePomodoroState(running, START_TIME + 25 * MINUTE)

    expect(beforeEnd).toEqual({ state: running, completedPhase: null, advanced: false })
    expect(completed).toMatchObject({
      completedPhase: 'focus',
      advanced: true,
      state: {
        phase: 'short-break',
        completedFocusSessions: 1,
        focusSessionsInCycle: 1,
        timer: {
          status: 'idle',
          durationMs: 5 * MINUTE,
        },
      },
    })

    const muchLater = reconcilePomodoroState(completed.state, START_TIME + 10 * 60 * MINUTE)
    expect(muchLater).toEqual({
      state: completed.state,
      completedPhase: null,
      advanced: false,
    })
  })

  it('uses a long break after the configured focus count and resets the cycle after it', () => {
    let state = createPomodoroState({
      workMinutes: 2,
      shortBreakMinutes: 1,
      longBreakMinutes: 3,
      focusSessionsBeforeLongBreak: 2,
    })
    let now = START_TIME

    let transition = finishCurrentPhase(state, now)
    state = transition.state
    now += 2 * MINUTE
    expect(state.phase).toBe('short-break')

    transition = finishCurrentPhase(state, now)
    state = transition.state
    now += MINUTE
    expect(state).toMatchObject({ phase: 'focus', focusSessionsInCycle: 1 })
    expect(getPomodoroSnapshot(state, now).focusSessionNumber).toBe(2)

    transition = finishCurrentPhase(state, now)
    state = transition.state
    now += 2 * MINUTE
    expect(state).toMatchObject({
      phase: 'long-break',
      completedFocusSessions: 2,
      focusSessionsInCycle: 2,
      timer: { durationMs: 3 * MINUTE, status: 'idle' },
    })

    transition = finishCurrentPhase(state, now)
    state = transition.state
    expect(state).toMatchObject({
      phase: 'focus',
      completedFocusSessions: 2,
      focusSessionsInCycle: 0,
    })
  })

  it('pauses and resumes the active phase using absolute timestamps', () => {
    const running = startPomodoro(createPomodoroState(), START_TIME)
    const paused = pausePomodoro(running, START_TIME + 7 * MINUTE)
    const resumed = resumePomodoro(paused, START_TIME + 40 * MINUTE)

    expect(paused.timer).toMatchObject({
      status: 'paused',
      elapsedBeforeStartMs: 7 * MINUTE,
      remainingWhenPausedMs: 18 * MINUTE,
    })
    expect(resumed.timer).toMatchObject({
      status: 'running',
      endAt: START_TIME + 58 * MINUTE,
    })
    expect(getPomodoroSnapshot(resumed, START_TIME + 43 * MINUTE).timer.displayMs).toBe(15 * MINUTE)
  })

  it('restores a running phase paused, but advances an expired phase to ready', () => {
    const running = startPomodoro(createPomodoroState(), START_TIME)

    expect(restorePomodoroState(running, START_TIME + 10 * MINUTE)).toMatchObject({
      requiresResume: true,
      completedPhase: null,
      state: {
        phase: 'focus',
        timer: {
          status: 'paused',
          remainingWhenPausedMs: 15 * MINUTE,
        },
      },
    })

    expect(restorePomodoroState(running, START_TIME + 2 * 60 * MINUTE)).toMatchObject({
      requiresResume: false,
      completedPhase: 'focus',
      state: {
        phase: 'short-break',
        completedFocusSessions: 1,
        timer: { status: 'idle', durationMs: 5 * MINUTE },
      },
    })
  })

  it('clamps a backwards clock change instead of adding phase time', () => {
    const running = startPomodoro(createPomodoroState(), START_TIME)
    const restored = restorePomodoroState(running, START_TIME - MINUTE)

    expect(restored).toMatchObject({
      requiresResume: true,
      state: {
        phase: 'focus',
        timer: {
          status: 'paused',
          elapsedBeforeStartMs: 0,
          remainingWhenPausedMs: 25 * MINUTE,
        },
      },
    })
  })

  it('only advances a completed phase and can reconfigure by resetting progress', () => {
    const state = createPomodoroState()
    expect(advancePomodoroPhase(state)).toBe(state)

    const completed = completePomodoroPhase(state, START_TIME)
    expect(advancePomodoroPhase(completed)).toMatchObject({
      phase: 'short-break',
      completedFocusSessions: 1,
    })

    const configured = configurePomodoro(completed, {
      workMinutes: 45,
      shortBreakMinutes: 10,
      longBreakMinutes: 30,
      focusSessionsBeforeLongBreak: 3,
    })
    expect(configured).toMatchObject({
      phase: 'focus',
      completedFocusSessions: 0,
      timer: { durationMs: 45 * MINUTE, status: 'idle' },
    })
  })

  it('rejects invalid configuration values', () => {
    expect(() => createPomodoroState({
      ...DEFAULT_POMODORO_CONFIG,
      workMinutes: 0,
    })).toThrow(RangeError)
    expect(() => createPomodoroState({
      ...DEFAULT_POMODORO_CONFIG,
      focusSessionsBeforeLongBreak: 2.5,
    })).toThrow(RangeError)
  })
})
