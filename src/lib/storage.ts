import { PRESETS as PRESET_DEFINITIONS } from '../data/presets'
import type {
  Intensity,
  PomodoroState,
  PreferencesV2,
  PresetId,
  RestoredPomodoroSession,
  RestoredSession,
  SessionPlanV1,
  StarfieldSpeedSeconds,
  ThemeMode,
  TimerState,
} from '../types'
import {
  createPomodoroState,
  getPomodoroPhaseDurationMs,
  isPomodoroConfig,
  restorePomodoroState,
} from './pomodoro'
import {
  DEFAULT_CUSTOM_DURATION_MINUTES,
  DEFAULT_SESSION_PLAN,
  MAX_CUSTOM_DURATION_MINUTES,
  MIN_CUSTOM_DURATION_MINUTES,
  createSessionPlan,
  isSessionPlan,
} from './session'
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
  starfieldSpeedSeconds: 50,
}

export interface PersistedStateV3 {
  version: 3
  preferences: PreferencesV2
  timer: TimerState
  sessionPlan: SessionPlanV1
  pomodoro: PomodoroState
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
  sessionPlan: SessionPlanV1
  pomodoroSession: RestoredPomodoroSession
}

const PRESETS: ReadonlySet<PresetId> = new Set(PRESET_DEFINITIONS.map((preset) => preset.id))
const LEGACY_PRESETS = new Set(['deep-work', 'flow', 'calm-focus'])
const INTENSITIES: ReadonlySet<Intensity> = new Set(['soft', 'standard', 'strong'])
const THEMES: ReadonlySet<ThemeMode> = new Set(['light', 'dark'])
const STARFIELD_SPEEDS: ReadonlySet<StarfieldSpeedSeconds> = new Set([30, 50, 75, 105])
const TIMER_STATUSES = new Set(['idle', 'running', 'paused', 'completed'])
const POMODORO_PHASES = new Set(['focus', 'short-break', 'long-break'])

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
    // Existing browser-only preferences predate this setting. Accept them once,
    // then hydrate the default below instead of discarding a person's setup.
    && (value.starfieldSpeedSeconds === undefined
      || STARFIELD_SPEEDS.has(value.starfieldSpeedSeconds as StarfieldSpeedSeconds))
    && hasValidPreferenceFields(value)
}

const normalizePreferences = (preferences: PreferencesV2): PreferencesV2 => ({
  ...preferences,
  starfieldSpeedSeconds: STARFIELD_SPEEDS.has(preferences.starfieldSpeedSeconds)
    ? preferences.starfieldSpeedSeconds
    : DEFAULT_PREFERENCES.starfieldSpeedSeconds,
})

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

export function isPomodoroState(value: unknown): value is PomodoroState {
  if (!isObject(value)
    || value.version !== 1
    || !isPomodoroConfig(value.config)
    || !POMODORO_PHASES.has(String(value.phase))
    || !Number.isSafeInteger(value.completedFocusSessions)
    || (value.completedFocusSessions as number) < 0
    || !Number.isSafeInteger(value.focusSessionsInCycle)
    || (value.focusSessionsInCycle as number) < 0
    || !isTimerState(value.timer)) {
    return false
  }

  const config = value.config
  const phase = value.phase as PomodoroState['phase']
  const focusSessionsInCycle = value.focusSessionsInCycle as number
  const target = config.focusSessionsBeforeLongBreak
  const phaseHasValidCycleCount = phase === 'focus'
    ? focusSessionsInCycle < target
    : phase === 'short-break'
      ? focusSessionsInCycle > 0 && focusSessionsInCycle < target
      : focusSessionsInCycle === target

  return phaseHasValidCycleCount
    && (value.completedFocusSessions as number) >= focusSessionsInCycle
    && value.timer.mode === 'countdown'
    && value.timer.durationMs === getPomodoroPhaseDurationMs(config, phase)
}

const isPersistedStateV3 = (value: unknown): value is PersistedStateV3 =>
  isObject(value)
  && value.version === 3
  && isPreferencesV2(value.preferences)
  && isTimerState(value.timer)
  && isSessionPlan(value.sessionPlan)
  && isPomodoroState(value.pomodoro)

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
    starfieldSpeedSeconds: DEFAULT_PREFERENCES.starfieldSpeedSeconds,
  },
  timer: { ...legacy.timer },
})

const inferSessionPlan = (preferences: PreferencesV2): SessionPlanV1 => {
  if (preferences.durationMinutes === null) {
    return createSessionPlan({ choice: 'endless' })
  }

  if (preferences.durationMinutes === 60) {
    return createSessionPlan({ choice: 'sixty' })
  }

  const customDurationMinutes = Number.isInteger(preferences.durationMinutes)
    ? Math.min(
        Math.max(preferences.durationMinutes, MIN_CUSTOM_DURATION_MINUTES),
        MAX_CUSTOM_DURATION_MINUTES,
      )
    : DEFAULT_CUSTOM_DURATION_MINUTES

  return createSessionPlan({ choice: 'custom', customDurationMinutes })
}

const migratePersistedStateV2 = (persisted: PersistedStateV2): PersistedStateV3 => ({
  version: 3,
  preferences: normalizePreferences(persisted.preferences),
  timer: { ...persisted.timer },
  sessionPlan: inferSessionPlan(persisted.preferences),
  pomodoro: createPomodoroState(),
})

const readRawState = (storage: Storage | null): PersistedStateV3 | null => {
  if (!storage) return null

  const current = readJson(storage, STORAGE_KEY)
  if (isPersistedStateV3(current)) {
    return { ...current, preferences: normalizePreferences(current.preferences) }
  }
  if (isPersistedStateV2(current)) return migratePersistedStateV2(current)

  const legacy = readJson(storage, LEGACY_STORAGE_KEY)
  return isLegacyPersistedStateV1(legacy)
    ? migratePersistedStateV2(migrateLegacyState(legacy))
    : null
}

export function createDefaultPersistedState(): PersistedStateV3 {
  return {
    version: 3,
    preferences: { ...DEFAULT_PREFERENCES },
    timer: createTimerState(),
    sessionPlan: { ...DEFAULT_SESSION_PLAN },
    pomodoro: createPomodoroState(),
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
    sessionPlan: { ...persisted.sessionPlan },
    pomodoroSession: restorePomodoroState({
      ...persisted.pomodoro,
      config: { ...persisted.pomodoro.config },
      timer: { ...persisted.pomodoro.timer },
    }, now),
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

export function loadPomodoroSession(
  storage: Storage | null = getBrowserStorage(),
  now = Date.now(),
): RestoredPomodoroSession {
  return loadStoredState(storage, now).pomodoroSession
}

const writeState = (state: PersistedStateV3, storage: Storage | null): boolean => {
  if (!storage || !isPersistedStateV3(state)) return false

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

export function saveSessionPlan(
  sessionPlan: SessionPlanV1,
  storage: Storage | null = getBrowserStorage(),
): boolean {
  if (!isSessionPlan(sessionPlan)) return false

  const current = readRawState(storage) ?? createDefaultPersistedState()
  return writeState({ ...current, sessionPlan: { ...sessionPlan } }, storage)
}

export function savePomodoroState(
  pomodoro: PomodoroState,
  storage: Storage | null = getBrowserStorage(),
): boolean {
  if (!isPomodoroState(pomodoro)) return false

  const current = readRawState(storage) ?? createDefaultPersistedState()
  return writeState({
    ...current,
    pomodoro: {
      ...pomodoro,
      config: { ...pomodoro.config },
      timer: { ...pomodoro.timer },
    },
  }, storage)
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
