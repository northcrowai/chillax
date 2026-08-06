import { PRESETS as PRESET_DEFINITIONS } from '../data/presets'
import type {
  Intensity,
  PreferencesV2,
  PresetId,
  RestoredSession,
  ThemeMode,
  TimerState,
} from '../types'
import { createTimerState, DEFAULT_DURATION_MS, restoreTimerState } from './timer'

export const STORAGE_KEY = 'chillax:v2'
export const LEGACY_STORAGE_KEY = 'chillax:v1'

export const DEFAULT_PREFERENCES: PreferencesV2 = {
  version: 2,
  preset: 'deep-work',
  intensity: 'standard',
  durationMinutes: DEFAULT_DURATION_MS / 60_000,
  volume: 0.55,
  previousVolume: 0.55,
  wakeLockEnabled: false,
  theme: 'light',
}

export interface PersistedStateV2 {
  version: 2
  preferences: PreferencesV2
  timer: TimerState
}

interface LegacyPreferencesV1 {
  version: 1
  preset: 'deep-work' | 'flow' | 'calm-focus'
  intensity: Intensity
  durationMinutes: number | null
  volume: number
  previousVolume: number
  wakeLockEnabled: boolean
}

interface LegacyPersistedStateV1 {
  version: 1
  preferences: LegacyPreferencesV1
  timer: TimerState
}

export interface LoadedStoredState {
  preferences: PreferencesV2
  session: RestoredSession
}

const PRESETS: ReadonlySet<PresetId> = new Set(PRESET_DEFINITIONS.map((preset) => preset.id))
const LEGACY_PRESETS = new Set(['deep-work', 'flow', 'calm-focus'])
const INTENSITIES: ReadonlySet<Intensity> = new Set(['soft', 'standard', 'strong'])
const THEMES: ReadonlySet<ThemeMode> = new Set(['light', 'dark'])
const TIMER_STATUSES = new Set(['idle', 'running', 'paused', 'completed'])

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isNonNegativeNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0

const isNullableNonNegativeNumber = (value: unknown): value is number | null =>
  value === null || isNonNegativeNumber(value)

const hasValidPreferenceFields = (value: Record<string, unknown>): boolean =>
  INTENSITIES.has(value.intensity as Intensity)
  && (value.durationMinutes === null
    || (isFiniteNumber(value.durationMinutes) && value.durationMinutes > 0))
  && isFiniteNumber(value.volume)
  && value.volume >= 0
  && value.volume <= 1
  && isFiniteNumber(value.previousVolume)
  && value.previousVolume >= 0
  && value.previousVolume <= 1
  && typeof value.wakeLockEnabled === 'boolean'

export function isPreferencesV2(value: unknown): value is PreferencesV2 {
  if (!isObject(value)) return false

  return value.version === 2
    && PRESETS.has(value.preset as PresetId)
    && THEMES.has(value.theme as ThemeMode)
    && hasValidPreferenceFields(value)
}

const isLegacyPreferencesV1 = (value: unknown): value is LegacyPreferencesV1 => {
  if (!isObject(value)) return false

  return value.version === 1
    && LEGACY_PRESETS.has(String(value.preset))
    && hasValidPreferenceFields(value)
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

  if (value.remainingWhenPausedMs > value.durationMs) return false

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

const isPersistedStateV2 = (value: unknown): value is PersistedStateV2 =>
  isObject(value)
  && value.version === 2
  && isPreferencesV2(value.preferences)
  && isTimerState(value.timer)

const isLegacyPersistedStateV1 = (value: unknown): value is LegacyPersistedStateV1 =>
  isObject(value)
  && value.version === 1
  && isLegacyPreferencesV1(value.preferences)
  && isTimerState(value.timer)

const getBrowserStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const readJson = (storage: Storage, key: string): unknown => {
  try {
    const serialized = storage.getItem(key)
    return serialized ? JSON.parse(serialized) as unknown : null
  } catch {
    return null
  }
}

const migrateLegacyState = (legacy: LegacyPersistedStateV1): PersistedStateV2 => ({
  version: 2,
  preferences: {
    ...legacy.preferences,
    version: 2,
    theme: 'light',
  },
  timer: { ...legacy.timer },
})

const readRawState = (storage: Storage | null): PersistedStateV2 | null => {
  if (!storage) return null

  const current = readJson(storage, STORAGE_KEY)
  if (isPersistedStateV2(current)) return current

  const legacy = readJson(storage, LEGACY_STORAGE_KEY)
  return isLegacyPersistedStateV1(legacy) ? migrateLegacyState(legacy) : null
}

export function createDefaultPersistedState(): PersistedStateV2 {
  return {
    version: 2,
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
): PreferencesV2 {
  return loadStoredState(storage).preferences
}

export function loadTimerSession(
  storage: Storage | null = getBrowserStorage(),
  now = Date.now(),
): RestoredSession {
  return loadStoredState(storage, now).session
}

const writeState = (state: PersistedStateV2, storage: Storage | null): boolean => {
  if (!storage || !isPersistedStateV2(state)) return false

  try {
    const serialized = JSON.stringify(state)
    if (storage.getItem(STORAGE_KEY) === serialized) return false

    storage.setItem(STORAGE_KEY, serialized)
    return true
  } catch {
    return false
  }
}

export function savePreferences(
  preferences: PreferencesV2,
  storage: Storage | null = getBrowserStorage(),
): boolean {
  if (!isPreferencesV2(preferences)) return false

  const current = readRawState(storage) ?? createDefaultPersistedState()
  return writeState({ ...current, preferences: { ...preferences } }, storage)
}

export function saveTimerState(
  timer: TimerState,
  storage: Storage | null = getBrowserStorage(),
): boolean {
  if (!isTimerState(timer)) return false

  const current = readRawState(storage) ?? createDefaultPersistedState()
  return writeState({ ...current, timer: { ...timer } }, storage)
}

export function clearStoredState(storage: Storage | null = getBrowserStorage()): boolean {
  if (!storage) return false

  try {
    const hadCurrent = storage.getItem(STORAGE_KEY) !== null
    const hadLegacy = storage.getItem(LEGACY_STORAGE_KEY) !== null
    storage.removeItem(STORAGE_KEY)
    storage.removeItem(LEGACY_STORAGE_KEY)
    return hadCurrent || hadLegacy
  } catch {
    return false
  }
}
