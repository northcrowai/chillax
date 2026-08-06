import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { AmbientVisual } from './components/AmbientVisual'
import { Brand } from './components/Brand'
import { DurationSelector } from './components/DurationSelector'
import { InstallIcon, MoonIcon, SettingsIcon, SunIcon } from './components/Icons'
import { IntensitySelector } from './components/IntensitySelector'
import { PlaybackControls } from './components/PlaybackControls'
import { PresetSelector } from './components/PresetSelector'
import { SettingsDialog } from './components/SettingsDialog'
import { TimerDisplay } from './components/TimerDisplay'
import { VolumeControl } from './components/VolumeControl'
import { DURATION_OPTIONS, getPreset } from './data/presets'
import { useFocusAudio } from './hooks/useFocusAudio'
import { useFocusTimer } from './hooks/useFocusTimer'
import { usePwaInstall } from './hooks/usePwaInstall'
import { useWakeLock } from './hooks/useWakeLock'
import {
  DEFAULT_PREFERENCES,
  clearStoredState,
  loadStoredState,
  savePreferences,
} from './lib/storage'
import { isChillaxOfflineReady, registerChillaxServiceWorker } from './pwa'
import type { Intensity, PreferencesV2, PresetId, ThemeMode } from './types'

const MINUTE_MS = 60_000
const QUICK_DURATIONS = new Set(DURATION_OPTIONS.map((option) => option.minutes))
const FOOTER_FACTS = ['12 soundscapes', '13.3 MB open audio pack', 'No analytics'] as const

const clampVolume = (volume: number) => Math.max(0, Math.min(0.75, volume))

const formatTimer = (milliseconds: number, countUp: boolean) => {
  const totalSeconds = countUp
    ? Math.floor(Math.max(0, milliseconds) / 1_000)
    : Math.ceil(Math.max(0, milliseconds) / 1_000)
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const parts = hours > 0 ? [hours, minutes, seconds] : [minutes, seconds]
  return parts.map((part) => String(part).padStart(2, '0')).join(':')
}

const getCustomDuration = (durationMinutes: number | null) =>
  durationMinutes !== null && !QUICK_DURATIONS.has(durationMinutes) ? durationMinutes : 35

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  return target.matches('input, textarea, select, button, a, [contenteditable="true"]')
}

export function App() {
  const [initialState] = useState(loadStoredState)
  const [preferences, setPreferences] = useState<PreferencesV2>(initialState.preferences)
  const [customMinutes, setCustomMinutes] = useState(() => getCustomDuration(initialState.preferences.durationMinutes))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const updateServiceWorkerRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const playbackPendingRef = useRef(false)
  const handledFatalErrorRef = useRef(0)
  const {
    clearError: clearAudioError,
    error: audioError,
    fatalErrorVersion,
    isBusy: audioIsBusy,
    pause: pauseAudio,
    playCompletionChime,
    setIntensity: setAudioIntensity,
    setPreset: setAudioPreset,
    setVolume: setAudioVolume,
    start: startAudio,
    stop: stopAudio,
  } = useFocusAudio()

  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    window.requestAnimationFrame(() => settingsButtonRef.current?.focus())
  }, [])

  const handleTimerComplete = useCallback(() => {
    void (async () => {
      await pauseAudio()
      await playCompletionChime()
    })()
  }, [pauseAudio, playCompletionChime])

  const timer = useFocusTimer({
    initialSession: initialState.session,
    onComplete: handleTimerComplete,
  })
  const {
    announcement: timerAnnouncement,
    pause: pauseTimer,
    reset: resetTimer,
    setDurationMinutes,
    snapshot: timerSnapshot,
    start: startTimer,
    state: timerState,
  } = timer
  const wakeLock = useWakeLock(preferences.wakeLockEnabled && timerState.status === 'running')
  const pwaInstall = usePwaInstall()

  const preset = getPreset(preferences.preset)
  const timerDisplay = formatTimer(timerSnapshot.displayMs, timerSnapshot.mode === 'endless')
  const timerStatus = timerState.status
  const sessionIsRunning = timerStatus === 'running'

  useEffect(() => {
    if (fatalErrorVersion === 0 || fatalErrorVersion === handledFatalErrorRef.current) return
    handledFatalErrorRef.current = fatalErrorVersion
    if (timerStatus === 'running') pauseTimer()
  }, [fatalErrorVersion, pauseTimer, timerStatus])

  useEffect(() => {
    savePreferences(preferences)
  }, [preferences])

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme
    document.documentElement.style.colorScheme = preferences.theme
    const themeColor = preferences.theme === 'dark' ? '#16071b' : '#f7f3ed'
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
      'content',
      themeColor,
    )
  }, [preferences.theme])

  useEffect(() => {
    let active = true
    void isChillaxOfflineReady().then((isReady) => {
      if (active && isReady) setOfflineReady(true)
    })

    updateServiceWorkerRef.current = registerChillaxServiceWorker({
      onNeedRefresh: () => setUpdateAvailable(true),
      onOfflineReady: () => setOfflineReady(true),
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    document.title = sessionIsRunning
      ? `${timerDisplay} · ${preset.name} · Chillax`
      : 'Chillax — Find your quiet'
  }, [preset.name, sessionIsRunning, timerDisplay])

  const handleTogglePlayback = useCallback(async () => {
    if (audioIsBusy || playbackPendingRef.current) return
    playbackPendingRef.current = true

    try {
      if (timerStatus === 'running') {
        pauseTimer()
        await pauseAudio()
        return
      }

      const started = await startAudio(
        preferences.preset,
        preferences.intensity,
        preferences.volume,
      )
      if (started) startTimer()
    } finally {
      playbackPendingRef.current = false
    }
  }, [
    audioIsBusy,
    pauseAudio,
    pauseTimer,
    preferences.intensity,
    preferences.preset,
    preferences.volume,
    startAudio,
    startTimer,
    timerStatus,
  ])

  const handleReset = useCallback(() => {
    const mode = preferences.durationMinutes === null ? 'endless' : 'countdown'
    const durationMs = preferences.durationMinutes === null
      ? null
      : preferences.durationMinutes * MINUTE_MS
    resetTimer(mode, durationMs)
    void stopAudio()
  }, [preferences.durationMinutes, resetTimer, stopAudio])

  const updatePreference = useCallback(<Key extends keyof PreferencesV2>(
    key: Key,
    value: PreferencesV2[Key],
  ) => {
    setPreferences((current) => ({ ...current, [key]: value }))
  }, [])

  const handlePresetChange = useCallback((nextPreset: PresetId) => {
    updatePreference('preset', nextPreset)
    void setAudioPreset(nextPreset, preferences.intensity)
  }, [preferences.intensity, setAudioPreset, updatePreference])

  const handleIntensityChange = useCallback((nextIntensity: Intensity) => {
    updatePreference('intensity', nextIntensity)
    void setAudioIntensity(nextIntensity)
  }, [setAudioIntensity, updatePreference])

  const handleDurationSelect = useCallback((minutes: number | null) => {
    updatePreference('durationMinutes', minutes)
    setDurationMinutes(minutes)
  }, [setDurationMinutes, updatePreference])

  const handleCustomDurationChange = useCallback((minutes: number) => {
    const nextMinutes = Math.max(5, Math.min(180, Number.isFinite(minutes) ? minutes : 25))
    setCustomMinutes(nextMinutes)
    updatePreference('durationMinutes', nextMinutes)
    setDurationMinutes(nextMinutes)
  }, [setDurationMinutes, updatePreference])

  const handleVolumeChange = useCallback((volume: number) => {
    const nextVolume = clampVolume(volume)
    setPreferences((current) => ({
      ...current,
      volume: nextVolume,
      previousVolume: nextVolume > 0 ? nextVolume : current.previousVolume,
    }))
    setAudioVolume(nextVolume)
  }, [setAudioVolume])

  const handleToggleMute = useCallback(() => {
    const nextVolume = preferences.volume === 0
      ? Math.max(0.1, Math.min(0.75, preferences.previousVolume))
      : 0
    setPreferences((current) => ({
      ...current,
      volume: nextVolume,
      previousVolume: current.volume > 0 ? current.volume : current.previousVolume,
    }))
    setAudioVolume(nextVolume)
  }, [preferences.previousVolume, preferences.volume, setAudioVolume])

  const handleResetPreferences = useCallback(() => {
    clearStoredState()
    setPreferences({ ...DEFAULT_PREFERENCES })
    setCustomMinutes(35)
    resetTimer('countdown', DEFAULT_PREFERENCES.durationMinutes! * MINUTE_MS)
    void stopAudio()
    closeSettings()
  }, [closeSettings, resetTimer, stopAudio])

  const handleWakeLockChange = useCallback((enabled: boolean) => {
    updatePreference('wakeLockEnabled', enabled)
  }, [updatePreference])

  const handleThemeChange = useCallback((theme: ThemeMode) => {
    updatePreference('theme', theme)
  }, [updatePreference])

  const handleToggleTheme = useCallback(() => {
    handleThemeChange(preferences.theme === 'light' ? 'dark' : 'light')
  }, [handleThemeChange, preferences.theme])

  const handleUpdate = useCallback(() => {
    if (sessionIsRunning) return
    void updateServiceWorkerRef.current?.(true)
  }, [sessionIsRunning])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (settingsOpen || isTypingTarget(event.target) || event.repeat) return
      if (event.code === 'Space') {
        event.preventDefault()
        void handleTogglePlayback()
      } else if (event.key.toLowerCase() === 'm') {
        event.preventDefault()
        handleToggleMute()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleToggleMute, handleTogglePlayback, settingsOpen])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: preset.name,
      artist: 'Chillax Focus',
      album: preset.sound,
      artwork: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
    })
    navigator.mediaSession.playbackState = sessionIsRunning ? 'playing' : 'paused'
    navigator.mediaSession.setActionHandler('play', () => {
      if (!sessionIsRunning) void handleTogglePlayback()
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      if (sessionIsRunning) void handleTogglePlayback()
    })
    navigator.mediaSession.setActionHandler('stop', handleReset)
    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('stop', null)
    }
  }, [handleReset, handleTogglePlayback, preset.name, preset.sound, sessionIsRunning])

  return (
    <div class="app" data-preset={preferences.preset} data-theme={preferences.theme}>
      <div
        aria-hidden={settingsOpen || undefined}
        class="app-shell"
        inert={settingsOpen || undefined}
      >
        <header class="app-header">
          <Brand />
          <div class="header-actions">
            {pwaInstall.canInstall ? (
              <button class="header-action" onClick={() => void pwaInstall.install()} type="button">
                <InstallIcon />
                <span>Install app</span>
              </button>
            ) : null}
            <button
              aria-label={`Switch to ${preferences.theme === 'light' ? 'dark' : 'light'} theme`}
              class="icon-button"
              onClick={handleToggleTheme}
              type="button"
            >
              {preferences.theme === 'light' ? <MoonIcon /> : <SunIcon />}
            </button>
            <button
              aria-label="Open settings"
              class="icon-button"
              onClick={openSettings}
              ref={settingsButtonRef}
              type="button"
            >
              <SettingsIcon />
            </button>
          </div>
        </header>

        <main class="app-main">
          <section class="focus-stage" aria-label="Focus session player">
            <div class="visual-panel">
              <div class="visual-panel__topline">
                <span>{preset.source.type === 'procedural' ? 'Live generated' : 'Streamed on demand'}</span>
                <span class={`play-state${sessionIsRunning ? ' is-active' : ''}`}>
                  <i aria-hidden="true" />
                  {sessionIsRunning ? 'Playing' : 'Ready'}
                </span>
              </div>
              <div class="visual-panel__art">
                <AmbientVisual
                  intensity={preferences.intensity}
                  isPlaying={sessionIsRunning}
                  preset={preferences.preset}
                  theme={preferences.theme}
                />
              </div>
              <div class="visual-panel__caption">
                <span class="eyebrow">Now selected</span>
                <strong>{preset.name}</strong>
                <p>{preset.description}</p>
              </div>
            </div>

            <div class="session-panel">
              <header class="intro" aria-labelledby="page-title">
                <span class="eyebrow">Your quiet corner</span>
                <h1 id="page-title">Find your quiet.</h1>
                <p>Choose an atmosphere, set your time, and let everything else fall away.</p>
              </header>

              <TimerDisplay
                display={timerDisplay}
                mode={timerSnapshot.mode}
                presetName={preset.name}
                progress={timerSnapshot.progress}
                status={timerSnapshot.status}
              />
              <PlaybackControls
                isBusy={audioIsBusy}
                onReset={handleReset}
                onToggle={() => void handleTogglePlayback()}
                status={timerSnapshot.status}
              />

              <div class="focus-controls">
                <DurationSelector
                  customMinutes={customMinutes}
                  disabled={sessionIsRunning || audioIsBusy}
                  durationMinutes={preferences.durationMinutes}
                  onCustomChange={handleCustomDurationChange}
                  onSelect={handleDurationSelect}
                />
                <IntensitySelector
                  disabled={audioIsBusy}
                  onChange={handleIntensityChange}
                  value={preferences.intensity}
                />
                <VolumeControl
                  disabled={audioIsBusy}
                  onChange={handleVolumeChange}
                  onToggleMute={handleToggleMute}
                  value={preferences.volume}
                />
              </div>
            </div>
          </section>

          <PresetSelector
            disabled={audioIsBusy}
            onChange={handlePresetChange}
            value={preferences.preset}
          />
        </main>

        <footer class="app-footer">
          <div class="app-footer__facts">
            {FOOTER_FACTS.map((fact) => <span key={fact}>{fact}</span>)}
          </div>
          <span class="keyboard-hint"><kbd>Space</kbd> play / <kbd>M</kbd> mute</span>
        </footer>
      </div>

      <SettingsDialog
        isStandalone={pwaInstall.isStandalone}
        offlineReady={offlineReady || pwaInstall.isStandalone}
        onClose={closeSettings}
        onResetPreferences={handleResetPreferences}
        onThemeChange={handleThemeChange}
        onWakeLockChange={handleWakeLockChange}
        open={settingsOpen}
        theme={preferences.theme}
        wakeLockEnabled={preferences.wakeLockEnabled}
        wakeLockSupported={wakeLock.isSupported}
      />

      {audioError ? (
        <aside class="notice notice--error" role="alert">
          <p>{audioError}</p>
          <button onClick={clearAudioError} type="button">Dismiss</button>
        </aside>
      ) : null}

      {wakeLock.error && !audioError ? (
        <aside class="notice notice--error" role="status">
          <p>Chillax could not keep the display awake. Your soundscape will continue normally.</p>
          <button onClick={() => updatePreference('wakeLockEnabled', false)} type="button">Turn off</button>
        </aside>
      ) : null}

      {updateAvailable && !audioError && !wakeLock.error ? (
        <aside class="notice" role="status">
          <p>{sessionIsRunning ? 'An update is ready. Pause your session before refreshing.' : 'A fresh version of Chillax is ready.'}</p>
          <button disabled={sessionIsRunning} onClick={handleUpdate} type="button">Update</button>
        </aside>
      ) : null}

      <span class="sr-only" aria-live="polite">{timerAnnouncement}</span>
    </div>
  )
}
