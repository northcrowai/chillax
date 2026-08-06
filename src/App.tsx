import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { AmbientVisual } from './components/AmbientVisual'
import { Brand } from './components/Brand'
import { CustomSessionDialog } from './components/CustomSessionDialog'
import { InstallIcon, MoonIcon, SettingsIcon, SunIcon } from './components/Icons'
import { IntensitySelector } from './components/IntensitySelector'
import { PlaybackControls } from './components/PlaybackControls'
import { PresetSelector } from './components/PresetSelector'
import { SessionSelector } from './components/SessionSelector'
import { SettingsDialog } from './components/SettingsDialog'
import { TimerDisplay } from './components/TimerDisplay'
import { VolumeControl } from './components/VolumeControl'
import { getPreset } from './data/presets'
import { useFocusAudio } from './hooks/useFocusAudio'
import { useFocusTimer } from './hooks/useFocusTimer'
import { usePomodoroTimer } from './hooks/usePomodoroTimer'
import { usePwaInstall } from './hooks/usePwaInstall'
import { useWakeLock } from './hooks/useWakeLock'
import { DEFAULT_POMODORO_CONFIG } from './lib/pomodoro'
import { DEFAULT_SESSION_PLAN, createSessionPlan, resolveSessionPlan } from './lib/session'
import {
  DEFAULT_PREFERENCES,
  clearStoredState,
  loadStoredState,
  savePreferences,
  saveSessionPlan,
} from './lib/storage'
import { isChillaxOfflineReady, registerChillaxServiceWorker } from './pwa'
import type {
  Intensity,
  PomodoroConfig,
  PomodoroPhase,
  PreferencesV2,
  PresetId,
  SessionChoice,
  SessionPlanV1,
  ThemeMode,
  TimerStatus,
} from './types'

const FOOTER_FACTS = ['15 soundscapes', '19.2 MB open audio pack', 'No analytics'] as const

const POMODORO_PLAYBACK_NAMES: Readonly<Record<PomodoroPhase, string>> = {
  focus: 'focus session',
  'short-break': 'short break',
  'long-break': 'long break',
}

const POMODORO_PHASE_NAMES: Readonly<Record<PomodoroPhase, string>> = {
  focus: 'Focus session',
  'short-break': 'Short break',
  'long-break': 'Long break',
}

const clampVolume = (volume: number) => Math.max(0, Math.min(1, volume))

const formatTimer = (milliseconds: number, countUp: boolean) => {
  const totalSeconds = countUp
    ? Math.floor(Math.max(0, milliseconds) / 1_000)
    : Math.ceil(Math.max(0, milliseconds) / 1_000)
  const hours = countUp ? Math.floor(totalSeconds / 3_600) : 0
  const minutes = countUp
    ? Math.floor((totalSeconds % 3_600) / 60)
    : Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const parts = hours > 0 ? [hours, minutes, seconds] : [minutes, seconds]
  return parts.map((part) => String(part).padStart(2, '0')).join(':')
}

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  return target.matches('input, textarea, select, button, a, [contenteditable="true"]')
}

const getPomodoroStatusText = (status: TimerStatus, phase: PomodoroPhase) => {
  const name = POMODORO_PHASE_NAMES[phase]
  if (status === 'idle') return `${name} ready`
  if (status === 'running') return `${name} in progress`
  if (status === 'paused') return `${name} paused`
  return `${name} complete`
}

export function App() {
  const [initialState] = useState(loadStoredState)
  const [preferences, setPreferences] = useState<PreferencesV2>(initialState.preferences)
  const [sessionPlan, setSessionPlan] = useState<SessionPlanV1>(initialState.sessionPlan)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customSessionOpen, setCustomSessionOpen] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const updateServiceWorkerRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const customSessionButtonRef = useRef<HTMLButtonElement>(null)
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
  const openCustomSession = useCallback(() => setCustomSessionOpen(true), [])
  const closeCustomSession = useCallback(() => {
    setCustomSessionOpen(false)
    window.requestAnimationFrame(() => customSessionButtonRef.current?.focus())
  }, [])

  const updatePreference = useCallback(<Key extends keyof PreferencesV2>(
    key: Key,
    value: PreferencesV2[Key],
  ) => {
    setPreferences((current) => ({ ...current, [key]: value }))
  }, [])

  const handleTimerComplete = useCallback(() => {
    void (async () => {
      await pauseAudio()
      await playCompletionChime()
    })()
  }, [pauseAudio, playCompletionChime])

  const {
    announcement: focusTimerAnnouncement,
    configure: configureFocusTimer,
    pause: pauseFocusTimer,
    reset: resetFocusTimer,
    snapshot: focusTimerSnapshot,
    start: startFocusTimer,
    state: focusTimerState,
  } = useFocusTimer({
    initialSession: initialState.session,
    onComplete: handleTimerComplete,
  })
  const {
    announcement: pomodoroAnnouncement,
    configure: configurePomodoroTimer,
    pause: pausePomodoroTimer,
    reset: resetPomodoroTimer,
    snapshot: pomodoroSnapshot,
    start: startPomodoroTimer,
    state: pomodoroState,
  } = usePomodoroTimer({
    initialSession: initialState.pomodoroSession,
    onPhaseComplete: handleTimerComplete,
  })
  const isPomodoro = sessionPlan.choice === 'custom' && sessionPlan.customMode === 'pomodoro'
  const timerState = isPomodoro ? pomodoroState.timer : focusTimerState
  const timerSnapshot = isPomodoro ? pomodoroSnapshot.timer : focusTimerSnapshot
  const timerAnnouncement = isPomodoro ? pomodoroAnnouncement : focusTimerAnnouncement
  const timerStatus = timerState.status
  const sessionIsRunning = timerStatus === 'running'
  const dialogOpen = settingsOpen || customSessionOpen
  const wakeLock = useWakeLock(preferences.wakeLockEnabled && sessionIsRunning)
  const pwaInstall = usePwaInstall()

  const preset = getPreset(preferences.preset)
  const timerDisplay = formatTimer(timerSnapshot.displayMs, timerSnapshot.mode === 'endless')
  const sessionLabel = isPomodoro
    ? pomodoroSnapshot.phase === 'focus'
      ? `Focus ${pomodoroSnapshot.focusSessionNumber} of ${pomodoroSnapshot.focusSessionsBeforeLongBreak}`
      : pomodoroSnapshot.phaseLabel
    : sessionPlan.choice === 'endless'
      ? 'Infinite session'
      : sessionPlan.choice === 'sixty'
        ? '60 minute session'
        : `${sessionPlan.customDurationMinutes} minute session`
  const playbackSessionName = isPomodoro
    ? POMODORO_PLAYBACK_NAMES[pomodoroSnapshot.phase]
    : 'focus session'
  const statusText = isPomodoro
    ? getPomodoroStatusText(timerSnapshot.status, pomodoroSnapshot.phase)
    : undefined

  useEffect(() => {
    if (fatalErrorVersion === 0 || fatalErrorVersion === handledFatalErrorRef.current) return
    handledFatalErrorRef.current = fatalErrorVersion
    if (timerStatus !== 'running') return
    if (isPomodoro) pausePomodoroTimer()
    else pauseFocusTimer()
  }, [fatalErrorVersion, isPomodoro, pauseFocusTimer, pausePomodoroTimer, timerStatus])

  useEffect(() => {
    savePreferences(preferences)
  }, [preferences])

  useEffect(() => {
    saveSessionPlan(sessionPlan)
  }, [sessionPlan])

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
      ? `${timerDisplay} · ${preset.name} · ${sessionLabel} · Chillax`
      : 'Chillax — Find your quiet'
  }, [preset.name, sessionIsRunning, sessionLabel, timerDisplay])

  const handleTogglePlayback = useCallback(async () => {
    if (audioIsBusy || playbackPendingRef.current) return
    playbackPendingRef.current = true

    try {
      if (timerStatus === 'running') {
        if (isPomodoro) pausePomodoroTimer()
        else pauseFocusTimer()
        await pauseAudio()
        return
      }

      const started = await startAudio(
        preferences.preset,
        preferences.intensity,
        preferences.volume,
      )
      if (!started) return
      if (isPomodoro) startPomodoroTimer()
      else startFocusTimer()
    } finally {
      playbackPendingRef.current = false
    }
  }, [
    audioIsBusy,
    isPomodoro,
    pauseAudio,
    pauseFocusTimer,
    pausePomodoroTimer,
    preferences.intensity,
    preferences.preset,
    preferences.volume,
    startAudio,
    startFocusTimer,
    startPomodoroTimer,
    timerStatus,
  ])

  const handleReset = useCallback(() => {
    if (isPomodoro) {
      resetPomodoroTimer()
    } else {
      const resolved = resolveSessionPlan(sessionPlan)
      if (resolved.kind === 'timer') resetFocusTimer(resolved.mode, resolved.durationMs)
    }
    void stopAudio()
  }, [isPomodoro, resetFocusTimer, resetPomodoroTimer, sessionPlan, stopAudio])

  const handleSessionSelect = useCallback((choice: Exclude<SessionChoice, 'custom'>) => {
    const nextPlan = createSessionPlan({ ...sessionPlan, choice })
    const resolved = resolveSessionPlan(nextPlan)
    setSessionPlan(nextPlan)
    if (resolved.kind === 'timer') configureFocusTimer(resolved.mode, resolved.durationMs)
    updatePreference('durationMinutes', choice === 'endless' ? null : 60)
    void stopAudio()
  }, [configureFocusTimer, sessionPlan, stopAudio, updatePreference])

  const handleApplyCustomSession = useCallback((
    nextPlan: SessionPlanV1,
    nextConfig: PomodoroConfig,
  ) => {
    setSessionPlan(nextPlan)
    configurePomodoroTimer(nextConfig)
    if (nextPlan.customMode === 'duration') {
      const resolved = resolveSessionPlan(nextPlan)
      if (resolved.kind === 'timer') configureFocusTimer(resolved.mode, resolved.durationMs)
      updatePreference('durationMinutes', nextPlan.customDurationMinutes)
    } else {
      updatePreference('durationMinutes', nextConfig.workMinutes)
    }
    void stopAudio()
    closeCustomSession()
  }, [closeCustomSession, configureFocusTimer, configurePomodoroTimer, stopAudio, updatePreference])

  const handlePresetChange = useCallback((nextPreset: PresetId) => {
    updatePreference('preset', nextPreset)
    void setAudioPreset(nextPreset, preferences.intensity)
  }, [preferences.intensity, setAudioPreset, updatePreference])

  const handleIntensityChange = useCallback((nextIntensity: Intensity) => {
    updatePreference('intensity', nextIntensity)
    void setAudioIntensity(nextIntensity)
  }, [setAudioIntensity, updatePreference])

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
      ? Math.max(0.1, Math.min(1, preferences.previousVolume))
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
    setSessionPlan({ ...DEFAULT_SESSION_PLAN })
    const defaultSession = resolveSessionPlan(DEFAULT_SESSION_PLAN)
    if (defaultSession.kind === 'timer') {
      resetFocusTimer(defaultSession.mode, defaultSession.durationMs)
    }
    configurePomodoroTimer({ ...DEFAULT_POMODORO_CONFIG })
    void stopAudio()
    closeSettings()
  }, [closeSettings, configurePomodoroTimer, resetFocusTimer, stopAudio])

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
      if (dialogOpen || isTypingTarget(event.target) || event.repeat) return
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
  }, [dialogOpen, handleToggleMute, handleTogglePlayback])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${preset.name} · ${sessionLabel}`,
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
  }, [handleReset, handleTogglePlayback, preset.name, preset.sound, sessionIsRunning, sessionLabel])

  return (
    <div class="app" data-preset={preferences.preset} data-theme={preferences.theme}>
      <div
        aria-hidden={dialogOpen || undefined}
        class="app-shell"
        inert={dialogOpen || undefined}
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
                progressLabel={`${sessionLabel} progress`}
                sessionLabel={sessionLabel}
                status={timerSnapshot.status}
                statusText={statusText}
              />
              <PlaybackControls
                isBusy={audioIsBusy}
                onReset={handleReset}
                onToggle={() => void handleTogglePlayback()}
                sessionName={playbackSessionName}
                status={timerSnapshot.status}
              />

              <div class="focus-controls">
                <SessionSelector
                  customButtonRef={customSessionButtonRef}
                  disabled={sessionIsRunning || audioIsBusy}
                  onOpenCustom={openCustomSession}
                  onSelect={handleSessionSelect}
                  plan={sessionPlan}
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

      {customSessionOpen ? (
        <CustomSessionDialog
          onApply={handleApplyCustomSession}
          onClose={closeCustomSession}
          plan={sessionPlan}
          pomodoroConfig={pomodoroState.config}
        />
      ) : null}

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
