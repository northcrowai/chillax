import { describe, expect, it } from 'vitest'
import { createTimerState, startTimer } from './timer'
import {
  DEFAULT_PREFERENCES,
  STORAGE_KEY,
  clearStoredState,
  createDefaultPersistedState,
  loadStoredState,
  savePreferences,
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

    expect(second.preferences).toEqual(DEFAULT_PREFERENCES)
    expect(second.session).toEqual({
      state: createTimerState(),
      requiresResume: false,
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

    expect(loadStoredState(storage, START_TIME)).toEqual({
      preferences: DEFAULT_PREFERENCES,
      session: {
        state: createTimerState(),
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

  it('gracefully handles unavailable storage and only clears existing data', () => {
    expect(saveTimerState(createTimerState(), null)).toBe(false)
    expect(clearStoredState(null)).toBe(false)

    const storage = new CountingStorage()
    expect(clearStoredState(storage)).toBe(false)
    saveTimerState(createTimerState(), storage)
    expect(clearStoredState(storage)).toBe(true)
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })
})
