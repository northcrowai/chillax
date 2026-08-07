import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { AmbientVisual } from './components/AmbientVisual'
import { Brand } from './components/Brand'
import { CustomSessionDialog } from './components/CustomSessionDialog'
import {
  CloudIcon,
  InstallIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  TimerIcon,
  TrafficIcon,
} from './components/Icons'
import { IntensitySelector } from './components/IntensitySelector'
import { LeaveByClock } from './components/LeaveByClock'
import { PlaybackControls } from './components/PlaybackControls'
import { PresetSelector } from './components/PresetSelector'
import { SessionSelector } from './components/SessionSelector'
import { SettingsDialog } from './components/SettingsDialog'
import { TimerDisplay } from './components/TimerDisplay'
import { TrafficPage } from './components/TrafficPage'
import { VolumeControl } from './components/VolumeControl'
import { WeatherPage } from './components/WeatherPage'
import { getRandomFocusQuote } from './data/quotes'
import { getPreset } from './data/presets'
import { clearWeatherPhotoPreferences } from './data/weatherPhotos'
import { useFocusAudio } from './hooks/useFocusAudio'
import { useFocusTimer } from './hooks/useFocusTimer'
import { usePomodoroTimer } from './hooks/usePomodoroTimer'
import { usePwaInstall } from './hooks/usePwaInstall'
import { useTrafficPlan } from './hooks/useTrafficPlan'
import { useWakeLock } from './hooks/useWakeLock'
import { DEFAULT_POMODORO_CONFIG } from './lib/pomodoro'
import { assetPath } from './lib/assets'
import { DEFAULT_SESSION_PLAN, createSessionPlan, resolveSessionPlan } from './lib/session'
import {
  DEFAULT_PREFERENCES,
  clearStoredState,
  loadStoredState,
  savePreferences,
  saveSessionPlan,
} from './lib/storage'
import { clearWeatherPreferences } from './lib/weather'
import { isChillaxOfflineReady, registerChillaxServiceWorker } from './pwa'
import type {
  Intensity,
  PomodoroConfig,
  PomodoroPhase,
  PreferencesV2,
  PresetId,
  SessionChoice,
  SessionPlanV1,
  StarfieldSpeedSeconds,
  ThemeMode,
  TimerStatus,
} from './types'

const FOOTER_FACTS = ['15 soundscapes', '19.2 MB open audio pack', 'No analytics'] as const

type AppView = 'focus' | 'traffic' | 'weather'

const appBasePath = import.meta.env.BASE_URL.replace(/\/$/, '')

const toAppPath = (view: AppView) => {
  const route = view === 'focus' ? '/' : `/${view}`
  return `${appBasePath}${route}` || '/'
}

const getInitialView = (): AppView => {
  if (typeof window === 'undefined') return 'focus'
  const route = appBasePath && window.location.pathname.startsWith(appBasePath)
    ? window.location.pathname.slice(appBasePath.length) || '/'
    : window.location.pathname
  if (/^\/weather\/?$/.test(route)) return 'weather'
  if (/^\/traffic\/?$/.test(route)) return 'traffic'
  return 'focus'
}

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
  const [focusQuote] = useState(getRandomFocusQuote)
  const [preferences, setPreferences] = useState<PreferencesV2>(initialState.preferences)
  const [sessionPlan, setSessionPlan] = useState<SessionPlanV1>(initialState.sessionPlan)
  const [activeView, setActiveView] = useState<AppView>(getInitialView)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customSessionOpen, setCustomSessionOpen] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const updateServiceWorkerRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const customSessionButtonRef = useRef<HTMLButtonElement>(null)
  const focusHeadingRef = useRef<HTMLHeadingElement>(null)
  const trafficHeadingRef = useRef<HTMLHeadingElement>(null)
  const weatherHeadingRef = useRef<HTMLHeadingElement>(null)
  const previousViewRef = useRef(activeView)
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

  const navigateToView = useCallback((view: AppView) => {
    setActiveView(view)
    const nextPath = toAppPath(view)
    if (window.location.pathname !== nextPath) {
      const updateHistory = view === 'focus' ? 'replaceState' : 'pushState'
      window.history[updateHistory]({ chillaxView: view }, '', nextPath)
    }
  }, [])

  const showFocusView = useCallback(() => navigateToView('focus'), [navigateToView])
  const toggleWeatherView = useCallback(() => {
    navigateToView(activeView === 'weather' ? 'focus' : 'weather')
  }, [activeView, navigateToView])
  const toggleTrafficView = useCallback(() => {
    navigateToView(activeView === 'traffic' ? 'focus' : 'traffic')
  }, [activeView, navigateToView])

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
  const traffic = useTrafficPlan({ theme: preferences.theme })
  const resetTraffic = traffic.reset

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
    const handlePopState = () => setActiveView(getInitialView())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (previousViewRef.current === activeView) return
    previousViewRef.current = activeView
    const frame = window.requestAnimationFrame(() => {
      const heading = activeView === 'weather'
        ? weatherHeadingRef.current
        : activeView === 'traffic'
          ? trafficHeadingRef.current
          : focusHeadingRef.current
      heading?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeView])

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
      : activeView === 'weather'
        ? 'Weather · Chillax'
        : activeView === 'traffic'
          ? 'Traffic · Chillax'
          : 'Chillax — Find your quiet'
  }, [activeView, preset.name, sessionIsRunning, sessionLabel, timerDisplay])

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
    clearWeatherPreferences()
    clearWeatherPhotoPreferences()
    resetTraffic()
    setPreferences({ ...DEFAULT_PREFERENCES })
    setSessionPlan({ ...DEFAULT_SESSION_PLAN })
    const defaultSession = resolveSessionPlan(DEFAULT_SESSION_PLAN)
    if (defaultSession.kind === 'timer') {
      resetFocusTimer(defaultSession.mode, defaultSession.durationMs)
    }
    configurePomodoroTimer({ ...DEFAULT_POMODORO_CONFIG })
    void stopAudio()
    showFocusView()
    closeSettings()
  }, [closeSettings, configurePomodoroTimer, resetFocusTimer, resetTraffic, showFocusView, stopAudio])

  const handleWakeLockChange = useCallback((enabled: boolean) => {
    updatePreference('wakeLockEnabled', enabled)
  }, [updatePreference])

  const handleThemeChange = useCallback((theme: ThemeMode) => {
    updatePreference('theme', theme)
  }, [updatePreference])

  const handleStarfieldSpeedChange = useCallback((seconds: StarfieldSpeedSeconds) => {
    updatePreference('starfieldSpeedSeconds', seconds)
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
        { src: assetPath('/pwa-192x192.png'), sizes: '192x192', type: 'image/png' },
        { src: assetPath('/pwa-512x512.png'), sizes: '512x512', type: 'image/png' },
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
          <Brand onNavigateHome={showFocusView} />
          <div class="header-actions">
            <button
              aria-label={activeView === 'focus' ? 'Focus timer' : 'Return to focus timer'}
              aria-pressed={activeView === 'focus'}
              class="icon-button"
              onClick={showFocusView}
              title="Focus timer"
              type="button"
            >
              <TimerIcon />
            </button>
            <button
              aria-label={activeView === 'weather' ? 'Close weather and return to focus' : 'Open weather'}
              aria-pressed={activeView === 'weather'}
              class="icon-button"
              onClick={toggleWeatherView}
              title={activeView === 'weather' ? 'Back to focus' : 'Weather'}
              type="button"
            >
              <CloudIcon />
            </button>
            <button
              aria-label={activeView === 'traffic' ? 'Close traffic and return to focus' : 'Open traffic'}
              aria-pressed={activeView === 'traffic'}
              class="icon-button"
              onClick={toggleTrafficView}
              title={activeView === 'traffic' ? 'Back to focus' : 'Traffic'}
              type="button"
            >
              <TrafficIcon />
            </button>
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
            {traffic.plan ? (
              <LeaveByClock
                departureTime={traffic.status === 'error' && traffic.isStale
                  ? null
                  : traffic.plan.leaveBy}
                expiresAt={traffic.plan.desiredArrivalTime}
                leaveNow={traffic.plan.leaveNow}
              />
            ) : null}
          </div>
        </header>

        {activeView === 'focus' ? (
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
                  starfieldSpeedSeconds={preferences.starfieldSpeedSeconds}
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
              <header class="intro intro--quote" aria-labelledby="page-title">
                <span class="eyebrow">Find your quiet.</span>
                <blockquote>
                  <h1 id="page-title" ref={focusHeadingRef} tabIndex={-1}>“{focusQuote.text}”</h1>
                  <footer>
                    <a
                      aria-label={`Source for quote by ${focusQuote.author}`}
                      href={focusQuote.sourceUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <cite>{focusQuote.author}</cite>
                    </a>
                    <span> · {focusQuote.work}</span>
                  </footer>
                </blockquote>
                <p class="intro__guidance">Choose an atmosphere, set your time, and let everything else fall away.</p>
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
        ) : activeView === 'weather' ? (
          <WeatherPage
            headingRef={weatherHeadingRef}
            isAudioBusy={audioIsBusy}
            onReturnToFocus={showFocusView}
            onTogglePlayback={() => void handleTogglePlayback()}
            playbackSessionName={playbackSessionName}
            presetName={preset.name}
            sessionLabel={sessionLabel}
            timerDisplay={timerDisplay}
            timerStatus={timerSnapshot.status}
          />
        ) : (
          <TrafficPage
            arrivalTime={traffic.preferences.arrivalTime}
            configurationMessage="Traffic is not connected on this deployment yet. Focus and Weather still work normally."
            configurationMissing={!traffic.isConfigured}
            cushionMinutes={traffic.preferences.cushionMinutes}
            errorMessage={traffic.error}
            headingRef={trafficHeadingRef}
            homeAddress={traffic.preferences.homeAddress}
            isAudioBusy={audioIsBusy}
            manualOrigin={traffic.manualOrigin}
            mapUrl={traffic.mapUrl}
            needsManualOrigin={traffic.needsManualOrigin}
            onArrivalTimeChange={traffic.setArrivalTime}
            onCalculate={(request) => {
              void traffic.calculate(request)
            }}
            onCushionMinutesChange={traffic.setCushionMinutes}
            onHomeAddressChange={traffic.setHomeAddress}
            onManualOriginChange={traffic.setManualOrigin}
            onReturnToFocus={showFocusView}
            onTogglePlayback={() => void handleTogglePlayback()}
            plan={traffic.plan}
            playbackSessionName={playbackSessionName}
            presetName={preset.name}
            sessionLabel={sessionLabel}
            status={traffic.status}
            timerDisplay={timerDisplay}
            timerStatus={timerSnapshot.status}
          />
        )}

        <footer class="app-footer">
          <div class="app-footer__facts">
            {pwaInstall.canInstall ? (
              <button class="app-footer__install" onClick={() => void pwaInstall.install()} type="button">
                <InstallIcon />
                Install app
              </button>
            ) : null}
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
        onStarfieldSpeedChange={handleStarfieldSpeedChange}
        onThemeChange={handleThemeChange}
        onWakeLockChange={handleWakeLockChange}
        open={settingsOpen}
        starfieldSpeedSeconds={preferences.starfieldSpeedSeconds}
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
