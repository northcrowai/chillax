export type PresetId = 'deep-work' | 'flow' | 'calm-focus'

export type Intensity = 'soft' | 'standard' | 'strong'

export type TimerMode = 'countdown' | 'endless'

export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed'

export interface DurationOption {
  id: string
  label: string
  mode: TimerMode
  minutes: number | null
}

export interface PreferencesV1 {
  version: 1
  preset: PresetId
  intensity: Intensity
  durationMinutes: number | null
  volume: number
  previousVolume: number
  wakeLockEnabled: boolean
}

export interface TimerState {
  version: 1
  mode: TimerMode
  status: TimerStatus
  durationMs: number | null
  startedAt: number | null
  endAt: number | null
  elapsedBeforeStartMs: number
  remainingWhenPausedMs: number | null
}

export interface TimerSnapshot {
  status: TimerStatus
  mode: TimerMode
  displayMs: number
  progress: number | null
}

export interface RestoredSession {
  state: TimerState
  requiresResume: boolean
}

export interface AudioEngineState {
  isReady: boolean
  isPlaying: boolean
  preset: PresetId
  intensity: Intensity
  volume: number
}

export interface FocusAudioEngineContract {
  prepare(): Promise<void>
  start(preset: PresetId, intensity: Intensity, volume: number): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  stop(): Promise<void>
  setPreset(preset: PresetId, intensity: Intensity): Promise<void>
  setIntensity(intensity: Intensity): Promise<void>
  setVolume(volume: number): void
  playCompletionChime(): Promise<void>
  getState(): AudioEngineState
  dispose(): Promise<void>
}
