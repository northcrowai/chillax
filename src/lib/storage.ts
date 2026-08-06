import type { Intensity, PreferencesV1, PresetId, RestoredSession, TimerState } from '../types'
import { createTimerState, DEFAULT_DURATION_MS, restoreTimerState } from './timer'

export const STORAGE_KEY = 'chillax:v1'

export const DEFAULT_PREFERENCES: PreferencesV1 = {
  version: 1,
  preset: 'deep-work',
  intensity: 'standard',
  durationMinutes: DEFAULT_DURATION_MS / 60_000,
  volume: 0.55,
  previousVolume: 0.55,
  wakeLockEnabled: false,
}

export interface PersistedStateV1 {
  version: 1
  preferences: PreferencesV1
  timer: TimerState
}

export interface LoadedStoredState {
  preferences: PreferencesV1
  session: RestoredSession
}

const PRESETS: ReadonlySet<PresetId> = new Set(['deep-work', 'flow', 'calm-focus'])
const INTENSITIES: ReadonlySet<Intensity> = new Set(['soft', 'standard', 'strong'])
const TIMER_STATUSES = new Set(['idle', 'running', 'paused', 'completed'])

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isNonNegativeNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0

const isNullableNonNegativeNumber = (value: unknown): value is number | null =>
  value === null || isNonNegativeNumber(value)

export function isPreferencesV1(value: unknown): value is PreferencesV1 {
  if (!isObject(value)) {
    return false
  }

  return value.version === 1
    && PRESETS.has(value.preset as PresetId)
    && INTENSITIES.has(value.intensity as Intensity)
    && (value.durationMinutes === null
      || (isFiniteNumber(value.durationMinutes) && value.durationMinutes > 0))
    && isFiniteNumber(value.volume)
    && value.volume >= 0
    && value.volume <= 1
    && isFiniteNumber(value.previousVolume)
    && value.previousVolume >= 0
    && value.previousVolume <= 1
    && typeof value.wakeLockEnabled === 'boolean'
}

export function isTimerState(value: unknown): value is TimerState {
  if (!isObject(value)
    || value.version !== 1
    || (value.mode !== 'countdown' && value.mode !== 'endless')
    || !TIMER_STATUSES.has(String(value.status))
    || !isNullableNonNegativeNumber(value.startedAt)
    || !isNullableNonNegativeNumber(value.endAt)
    || !isNonNegativeNumber(value.elapsedBeforeStartMs)
    || !isNullableNonNegativeNumber(value.remainingWhenPausedMs)) {
    return false
  }

  if (value.mode === 'endless') {
    if (value.durationMs !== null || value.endAt !== null || value.remainingWhenPausedMs !== null) {
      return false
    }

    return value.status === 'running'
      ? value.startedAt !== null
      : value.startedAt === null
  }

  if (!isFiniteNumber(value.durationMs)
    || value.durationMs <= 0
    || value.elapsedBeforeStartMs > value.durationMs) {
    return false
  }

  if (value.status === 'running') {
    return value.startedAt !== null
      && value.endAt !== null
      && value.endAt >= value.startedAt
      && value.endAt - value.startedAt <= value.durationMs
      && value.remainingWhenPausedMs === null
  }

  if (value.startedAt !== null || value.endAt !== null || value.remainingWhenPausedMs === null) {
    return false
  }

  if (value.remainingWhenPausedMs > value.durationMs) {
    return false
  }

  if (value.status === 'idle') {
    return value.elapsedBeforeStartMs === 0
      && value.remainingWhenPausedMs === value.durationMs
  }

  if (value.status === 'completed') {
    return value.elapsedBeforeStartMs === value.durationMs
      && value.remainingWhenPausedMs === 0
  }

  return value.remainingWhenPausedMs > 0
}

const isPersistedStateV1 = (value: unknown): value is PersistedStateV1 =>
  isObject(value)
  && value.version === 1
  && isPreferencesV1(value.preferences)
  && isTimerState(value.timer)

const getBrowserStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const readRawState = (storage: Storage | null): PersistedStateV1 | null => {
  if (!storage) {
    return null
  }

  try {
    const serialized = storage.getItem(STORAGE_KEY)
    if (!serialized) {
      return null
    }

    const parsed: unknown = JSON.parse(serialized)
    return isPersistedStateV1(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function createDefaultPersistedState(): PersistedStateV1 {
  return {
    version: 1,
    preferences: { ...DEFAULT_PREFERENCES },
    timer: createTimerState(),
  }
}

export function loadStoredState(
  storage: Storage | null = getBrowserStorage(),
  now = Date.now(),
): LoadedStoredState {
  const persisted = readRawState(storage) ?? createDefaultPersistedState()

  return {
    preferences: { ...persisted.preferences },
    session: restoreTimerState({ ...persisted.timer }, now),
  }
}

export function loadPreferences(
  storage: Storage | null = getBrowserStorage(),
): PreferencesV1 {
  return loadStoredState(storage).preferences
}

export function loadTimerSession(
  storage: Storage | null = getBrowserStorage(),
  now = Date.now(),
): RestoredSession {
  return loadStoredState(storage, now).session
}

const writeState = (state: PersistedStateV1, storage: Storage | null): boolean => {
  if (!storage || !isPersistedStateV1(state)) {
    return false
  }

  try {
    const serialized = JSON.stringify(state)
    if (storage.getItem(STORAGE_KEY) === serialized) {
      return false
    }

    storage.setItem(STORAGE_KEY, serialized)
    return true
  } catch {
    return false
  }
}

export function savePreferences(
  preferences: PreferencesV1,
  storage: Storage | null = getBrowserStorage(),
): boolean {
  if (!isPreferencesV1(preferences)) {
    return false
  }

  const current = readRawState(storage) ?? createDefaultPersistedState()
  return writeState({ ...current, preferences: { ...preferences } }, storage)
}

export function saveTimerState(
  timer: TimerState,
  storage: Storage | null = getBrowserStorage(),
): boolean {
  if (!isTimerState(timer)) {
    return false
  }

  const current = readRawState(storage) ?? createDefaultPersistedState()
  return writeState({ ...current, timer: { ...timer } }, storage)
}

export function clearStoredState(storage: Storage | null = getBrowserStorage()): boolean {
  if (!storage) {
    return false
  }

  try {
    if (storage.getItem(STORAGE_KEY) === null) {
      return false
    }
    storage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
