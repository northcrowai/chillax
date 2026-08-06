import { act, renderHook } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RestoredSession } from '../types'
import { createTimerState, startTimer } from '../lib/timer'
import { useFocusTimer } from './useFocusTimer'

const START_TIME = 1_800_000_000_000
const MINUTE = 60_000

const setVisibility = (visibilityState: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useFocusTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('ticks from absolute time and only announces status transitions', () => {
    let now = START_TIME
    const onStatusChange = vi.fn()
    const onComplete = vi.fn()
    const { result } = renderHook(() => useFocusTimer({
      storage: null,
      now: () => now,
      tickIntervalMs: 1_000,
      onStatusChange,
      onComplete,
    }))

    act(() => result.current.start())
    expect(result.current.state.status).toBe('running')
    expect(result.current.announcement).toBe('Focus session started.')
    expect(onStatusChange).toHaveBeenCalledTimes(1)

    now += 20 * MINUTE
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.snapshot.displayMs).toBe(40 * MINUTE)
    expect(onStatusChange).toHaveBeenCalledTimes(1)

    now += 41 * MINUTE
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.state.status).toBe('completed')
    expect(result.current.announcement).toBe('Focus session complete.')
    expect(onStatusChange).toHaveBeenCalledTimes(2)
    expect(onComplete).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('restores an interrupted session paused until the user resumes it', () => {
    let now = START_TIME + 10 * MINUTE
    const running = startTimer(createTimerState('countdown', 25 * MINUTE), START_TIME)
    const initialSession: RestoredSession = {
      state: {
        ...running,
        status: 'paused',
        startedAt: null,
        endAt: null,
        elapsedBeforeStartMs: 10 * MINUTE,
        remainingWhenPausedMs: 15 * MINUTE,
      },
      requiresResume: true,
    }
    const { result } = renderHook(() => useFocusTimer({
      initialSession,
      storage: null,
      now: () => now,
    }))

    expect(result.current.requiresResume).toBe(true)
    expect(result.current.snapshot.displayMs).toBe(15 * MINUTE)

    act(() => result.current.resume())
    expect(result.current.requiresResume).toBe(false)
    expect(result.current.state.endAt).toBe(now + 15 * MINUTE)

    now += 5 * MINUTE
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.snapshot.displayMs).toBe(10 * MINUTE)
  })

  it('supports quick/custom countdown durations and endless mode', () => {
    const { result } = renderHook(() => useFocusTimer({ storage: null }))

    act(() => result.current.setDurationMinutes(37))
    expect(result.current.state).toMatchObject({
      mode: 'countdown',
      durationMs: 37 * MINUTE,
      status: 'idle',
    })

    act(() => result.current.setDurationMinutes(null))
    expect(result.current.state).toMatchObject({
      mode: 'endless',
      durationMs: null,
      status: 'idle',
    })

    expect(() => act(() => result.current.setDurationMinutes(0))).toThrow(RangeError)
  })

  it('reconciles immediately when the page becomes visible after sleep', () => {
    let now = START_TIME
    const { result } = renderHook(() => useFocusTimer({
      initialSession: {
        state: createTimerState('countdown', MINUTE),
        requiresResume: false,
      },
      storage: null,
      now: () => now,
    }))

    act(() => result.current.start())
    act(() => setVisibility('hidden'))
    now += 5 * MINUTE
    act(() => setVisibility('visible'))

    expect(result.current.state.status).toBe('completed')
    expect(result.current.snapshot.displayMs).toBe(0)
  })
})
