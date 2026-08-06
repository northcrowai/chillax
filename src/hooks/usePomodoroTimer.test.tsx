import { act, renderHook } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPomodoroState } from '../lib/pomodoro'
import { usePomodoroTimer } from './usePomodoroTimer'

const START_TIME = 1_800_000_000_000
const MINUTE = 60_000

const setVisibility = (visibilityState: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('usePomodoroTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('advances an expired focus phase to a ready short break exactly once', () => {
    let now = START_TIME
    const onPhaseComplete = vi.fn()
    const { result } = renderHook(() => usePomodoroTimer({
      initialSession: {
        state: createPomodoroState({
          workMinutes: 1,
          shortBreakMinutes: 2,
          longBreakMinutes: 3,
          focusSessionsBeforeLongBreak: 2,
        }),
        requiresResume: false,
        completedPhase: null,
      },
      storage: null,
      now: () => now,
      onPhaseComplete,
    }))

    act(() => result.current.start())
    now += 2 * MINUTE
    act(() => {
      vi.advanceTimersByTime(1_000)
    })

    expect(result.current.state).toMatchObject({
      phase: 'short-break',
      completedFocusSessions: 1,
      timer: { status: 'idle', durationMs: 2 * MINUTE },
    })
    expect(result.current.announcement).toBe(
      'Focus session complete. Short break is ready.',
    )
    expect(onPhaseComplete).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(onPhaseComplete).toHaveBeenCalledTimes(1)
  })

  it('pauses, resumes, resets, and applies new configuration', () => {
    let now = START_TIME
    const { result } = renderHook(() => usePomodoroTimer({ storage: null, now: () => now }))

    act(() => result.current.start())
    now += 4 * MINUTE
    act(() => result.current.pause())
    expect(result.current.state.timer).toMatchObject({ status: 'paused' })

    act(() => result.current.resume())
    expect(result.current.state.timer.status).toBe('running')

    act(() => result.current.configure({
      workMinutes: 40,
      shortBreakMinutes: 8,
      longBreakMinutes: 20,
      focusSessionsBeforeLongBreak: 3,
    }))
    expect(result.current.state).toMatchObject({
      phase: 'focus',
      config: { workMinutes: 40, focusSessionsBeforeLongBreak: 3 },
      timer: { status: 'idle', durationMs: 40 * MINUTE },
    })

    act(() => result.current.reset())
    expect(result.current.state.completedFocusSessions).toBe(0)
  })

  it('reconciles immediately after a hidden-page sleep gap', () => {
    let now = START_TIME
    const onPhaseComplete = vi.fn()
    const { result } = renderHook(() => usePomodoroTimer({
      initialSession: {
        state: createPomodoroState({
          workMinutes: 1,
          shortBreakMinutes: 1,
          longBreakMinutes: 1,
          focusSessionsBeforeLongBreak: 1,
        }),
        requiresResume: false,
        completedPhase: null,
      },
      storage: null,
      now: () => now,
      onPhaseComplete,
    }))

    act(() => result.current.start())
    act(() => setVisibility('hidden'))
    now += 5 * MINUTE
    act(() => setVisibility('visible'))

    expect(result.current.state).toMatchObject({
      phase: 'long-break',
      timer: { status: 'idle' },
    })
    expect(onPhaseComplete).toHaveBeenCalledWith({
      completedPhase: 'focus',
      nextPhase: 'long-break',
    })
  })
})
