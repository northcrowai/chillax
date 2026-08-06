import { describe, expect, it } from 'vitest'
import {
  completeTimer,
  configureTimer,
  createTimerState,
  getTimerSnapshot,
  pauseTimer,
  resetTimer,
  restoreTimerState,
  resumeTimer,
  startTimer,
} from './timer'

const START_TIME = 1_800_000_000_000
const MINUTE = 60_000

describe('countdown timer', () => {
  it('uses absolute end timestamps across long background or sleep gaps', () => {
    const running = startTimer(createTimerState('countdown', 50 * MINUTE), START_TIME)

    expect(running.startedAt).toBe(START_TIME)
    expect(running.endAt).toBe(START_TIME + 50 * MINUTE)
    expect(getTimerSnapshot(running, START_TIME + 37 * MINUTE)).toMatchObject({
      status: 'running',
      displayMs: 13 * MINUTE,
      progress: 0.74,
    })
    expect(getTimerSnapshot(running, START_TIME + 90 * MINUTE)).toMatchObject({
      status: 'completed',
      displayMs: 0,
      progress: 1,
    })
  })

  it('pauses and resumes without counting paused time', () => {
    const running = startTimer(createTimerState('countdown', 25 * MINUTE), START_TIME)
    const paused = pauseTimer(running, START_TIME + 4 * MINUTE)

    expect(paused).toMatchObject({
      status: 'paused',
      startedAt: null,
      endAt: null,
      elapsedBeforeStartMs: 4 * MINUTE,
      remainingWhenPausedMs: 21 * MINUTE,
    })
    expect(getTimerSnapshot(paused, START_TIME + 20 * MINUTE).displayMs).toBe(21 * MINUTE)

    const resumed = resumeTimer(paused, START_TIME + 20 * MINUTE)
    expect(resumed.endAt).toBe(START_TIME + 41 * MINUTE)
    expect(getTimerSnapshot(resumed, START_TIME + 26 * MINUTE).displayMs).toBe(15 * MINUTE)
  })

  it('completes, restarts, resets, and supports caller-selected durations', () => {
    const configured = configureTimer(createTimerState(), 'countdown', 90 * MINUTE)
    const completed = completeTimer(startTimer(configured, START_TIME), START_TIME + MINUTE)

    expect(completed.status).toBe('completed')
    expect(getTimerSnapshot(completed, START_TIME + MINUTE).displayMs).toBe(0)

    const restarted = startTimer(completed, START_TIME + 2 * MINUTE)
    expect(restarted).toMatchObject({
      status: 'running',
      durationMs: 90 * MINUTE,
      endAt: START_TIME + 92 * MINUTE,
    })
    expect(resetTimer(restarted)).toEqual(createTimerState('countdown', 90 * MINUTE))
  })

  it('clamps a backwards clock change instead of adding time', () => {
    const initial = createTimerState('countdown', 25 * MINUTE)
    const running = startTimer(initial, START_TIME)

    expect(getTimerSnapshot(running, START_TIME - MINUTE).displayMs).toBe(25 * MINUTE)
    expect(pauseTimer(running, START_TIME - MINUTE).remainingWhenPausedMs).toBe(25 * MINUTE)
  })

  it('rejects invalid timer configurations and timestamps', () => {
    expect(() => createTimerState('countdown', 0)).toThrow(RangeError)
    expect(() => createTimerState('endless', MINUTE)).toThrow(RangeError)
    expect(() => startTimer(createTimerState(), Number.NaN)).toThrow(RangeError)
  })
})

describe('endless timer', () => {
  it('tracks elapsed time across pause and resume cycles', () => {
    const running = startTimer(createTimerState('endless', null), START_TIME)
    const paused = pauseTimer(running, START_TIME + 12 * MINUTE)
    const resumed = resumeTimer(paused, START_TIME + 30 * MINUTE)

    expect(getTimerSnapshot(paused, START_TIME + 30 * MINUTE)).toMatchObject({
      status: 'paused',
      displayMs: 12 * MINUTE,
      progress: null,
    })
    expect(getTimerSnapshot(resumed, START_TIME + 35 * MINUTE).displayMs).toBe(17 * MINUTE)
    expect(completeTimer(resumed, START_TIME + 36 * MINUTE)).toMatchObject({
      status: 'completed',
      elapsedBeforeStartMs: 18 * MINUTE,
    })
  })
})

describe('session restoration', () => {
  it('restores a still-valid running countdown as paused and requires a click', () => {
    const running = startTimer(createTimerState('countdown', 50 * MINUTE), START_TIME)
    const restored = restoreTimerState(running, START_TIME + 7 * MINUTE)

    expect(restored.requiresResume).toBe(true)
    expect(restored.state).toMatchObject({
      status: 'paused',
      elapsedBeforeStartMs: 7 * MINUTE,
      remainingWhenPausedMs: 43 * MINUTE,
    })
  })

  it('restores an expired countdown as completed', () => {
    const running = startTimer(createTimerState('countdown', 25 * MINUTE), START_TIME)
    const restored = restoreTimerState(running, START_TIME + 60 * MINUTE)

    expect(restored.requiresResume).toBe(false)
    expect(restored.state).toMatchObject({
      status: 'completed',
      remainingWhenPausedMs: 0,
    })
  })

  it('restores a running endless timer as paused with accurate elapsed time', () => {
    const running = startTimer(createTimerState('endless', null), START_TIME)
    const restored = restoreTimerState(running, START_TIME + 13 * MINUTE)

    expect(restored).toMatchObject({
      requiresResume: true,
      state: {
        status: 'paused',
        elapsedBeforeStartMs: 13 * MINUTE,
      },
    })
  })
})
