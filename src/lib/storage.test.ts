import { describe, expect, it } from 'vitest'
import { createPomodoroState, startPomodoro } from './pomodoro'
import { DEFAULT_SESSION_PLAN, createSessionPlan } from './session'
import { createTimerState, startTimer } from './timer'
import {
  DEFAULT_PREFERENCES,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  clearStoredState,
  createDefaultPersistedState,
  loadStoredState,
  savePomodoroState,
  savePreferences,
  saveSessionPlan,
  saveTimerState,
} from './storage'

const START_TIME = 1_800_000_000_000
const MINUTE = 60_000

class CountingStorage implements Storage {
  private readonly values = new Map<string, string>()
  writes = 0

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.writes += 1
    this.values.set(key, value)
  }
}

describe('versioned local storage', () => {
  it('returns independent defaults when storage is empty', () => {
    const storage = new CountingStorage()
    const first = loadStoredState(storage, START_TIME)
    first.preferences.volume = 0
    const second = loadStoredState(storage, START_TIME)

    expect(second).toMatchObject({
      preferences: DEFAULT_PREFERENCES,
      session: {
        state: createTimerState(),
        requiresResume: false,
      },
      sessionPlan: DEFAULT_SESSION_PLAN,
      pomodoroSession: {
        state: createPomodoroState(),
        requiresResume: false,
        completedPhase: null,
      },
    })
  })

  it.each([
    '{broken json',
    JSON.stringify({ version: 2 }),
    JSON.stringify({ ...createDefaultPersistedState(), preferences: { volume: 12 } }),
    JSON.stringify({ ...createDefaultPersistedState(), timer: { status: 'teleporting' } }),
  ])('safely falls back for invalid persisted data', (serialized) => {
    const storage = new CountingStorage()
    storage.setItem(STORAGE_KEY, serialized)

    expect(loadStoredState(storage, START_TIME)).toMatchObject({
      preferences: DEFAULT_PREFERENCES,
      session: {
        state: createTimerState(),
        requiresResume: false,
      },
      sessionPlan: DEFAULT_SESSION_PLAN,
      pomodoroSession: {
        state: createPomodoroState(),
        requiresResume: false,
      },
    })
  })

  it('preserves preferences and timer while writing only actual changes', () => {
    const storage = new CountingStorage()
    const timer = createTimerState('countdown', 90 * MINUTE)
    const preferences = {
      ...DEFAULT_PREFERENCES,
      preset: 'flow' as const,
      durationMinutes: 90,
      volume: 1,
      previousVolume: 1,
    }

    expect(saveTimerState(timer, storage)).toBe(true)
    expect(saveTimerState(timer, storage)).toBe(false)
    expect(savePreferences(preferences, storage)).toBe(true)
    expect(savePreferences(preferences, storage)).toBe(false)
    expect(storage.writes).toBe(2)

    const loaded = loadStoredState(storage, START_TIME)
    expect(loaded.preferences).toEqual(preferences)
    expect(loaded.session.state).toEqual(timer)
  })

  it('migrates v1 preferences without losing the saved timer', () => {
    const storage = new CountingStorage()
    const timer = createTimerState('countdown', 25 * MINUTE)
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({
      version: 1,
      preferences: {
        version: 1,
        preset: 'flow',
        intensity: 'strong',
        durationMinutes: 25,
        volume: 0.4,
        previousVolume: 0.4,
        wakeLockEnabled: true,
      },
      timer,
    }))

    const loaded = loadStoredState(storage, START_TIME)
    expect(loaded.preferences).toMatchObject({
      version: 2,
      preset: 'flow',
      intensity: 'strong',
      theme: 'light',
    })
    expect(loaded.session.state).toEqual(timer)
    expect(loaded.sessionPlan).toMatchObject({
      choice: 'custom',
      customMode: 'duration',
      customDurationMinutes: 25,
    })

    expect(savePreferences({ ...loaded.preferences, preset: 'fireplace' }, storage)).toBe(true)
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}').preferences.preset).toBe('fireplace')
  })

  it('migrates an existing v2 envelope and infers its session choice', () => {
    const storage = new CountingStorage()
    const timer = createTimerState('countdown', 90 * MINUTE)
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      preferences: {
        ...DEFAULT_PREFERENCES,
        durationMinutes: 90,
      },
      timer,
    }))

    const loaded = loadStoredState(storage, START_TIME)
    expect(loaded.preferences.starfieldSpeedSeconds).toBe(50)
    expect(loaded.session.state).toEqual(timer)
    expect(loaded.sessionPlan).toEqual(createSessionPlan({
      choice: 'custom',
      customDurationMinutes: 90,
    }))
    expect(loaded.pomodoroSession.state).toEqual(createPomodoroState())

    expect(saveSessionPlan({ ...loaded.sessionPlan, customMode: 'pomodoro' }, storage)).toBe(true)
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({
      version: 3,
      sessionPlan: { choice: 'custom', customMode: 'pomodoro' },
    })
  })

  it('restores a saved running session as paused when time remains', () => {
    const storage = new CountingStorage()
    const running = startTimer(createTimerState('countdown', 25 * MINUTE), START_TIME)
    saveTimerState(running, storage)

    const restored = loadStoredState(storage, START_TIME + 5 * MINUTE).session
    expect(restored).toMatchObject({
      requiresResume: true,
      state: {
        status: 'paused',
        remainingWhenPausedMs: 20 * MINUTE,
      },
    })
  })

  it('restores an expired saved session as completed', () => {
    const storage = new CountingStorage()
    const running = startTimer(createTimerState('countdown', MINUTE), START_TIME)
    saveTimerState(running, storage)

    expect(loadStoredState(storage, START_TIME + 2 * MINUTE).session).toMatchObject({
      requiresResume: false,
      state: { status: 'completed' },
    })
  })

  it('persists Pomodoro configuration, cycle progress, and active-phase recovery', () => {
    const storage = new CountingStorage()
    const configured = createPomodoroState({
      workMinutes: 2,
      shortBreakMinutes: 1,
      longBreakMinutes: 3,
      focusSessionsBeforeLongBreak: 2,
    })
    const running = startPomodoro(configured, START_TIME)

    expect(savePomodoroState(running, storage)).toBe(true)
    expect(savePomodoroState(running, storage)).toBe(false)
    expect(loadStoredState(storage, START_TIME + MINUTE).pomodoroSession).toMatchObject({
      requiresResume: true,
      completedPhase: null,
      state: {
        phase: 'focus',
        config: configured.config,
        timer: { status: 'paused', remainingWhenPausedMs: MINUTE },
      },
    })

    expect(loadStoredState(storage, START_TIME + 10 * MINUTE).pomodoroSession).toMatchObject({
      requiresResume: false,
      completedPhase: 'focus',
      state: {
        phase: 'short-break',
        completedFocusSessions: 1,
        focusSessionsInCycle: 1,
        timer: { status: 'idle', durationMs: MINUTE },
      },
    })
  })

  it('rejects invalid session and Pomodoro state writes', () => {
    const storage = new CountingStorage()
    expect(saveSessionPlan({
      ...DEFAULT_SESSION_PLAN,
      customDurationMinutes: 1,
    }, storage)).toBe(false)
    expect(savePomodoroState({
      ...createPomodoroState(),
      focusSessionsInCycle: 99,
    }, storage)).toBe(false)
    expect(storage.writes).toBe(0)
  })

  it('gracefully handles unavailable storage and only clears existing data', () => {
    expect(saveTimerState(createTimerState(), null)).toBe(false)
    expect(clearStoredState(null)).toBe(false)

    const storage = new CountingStorage()
    expect(clearStoredState(storage)).toBe(false)
    saveTimerState(createTimerState(), storage)
    expect(clearStoredState(storage)).toBe(true)
    expect(storage.getItem(STORAGE_KEY)).toBeNull()

    storage.setItem(LEGACY_STORAGE_KEY, '{}')
    expect(clearStoredState(storage)).toBe(true)
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
  })
})
