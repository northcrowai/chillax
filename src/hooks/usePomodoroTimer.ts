import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  configurePomodoro,
  getPomodoroSnapshot,
  pausePomodoro,
  reconcilePomodoroState,
  resetPomodoro,
  resumePomodoro,
  startPomodoro,
} from '../lib/pomodoro'
import { loadPomodoroSession, savePomodoroState } from '../lib/storage'
import type {
  PomodoroConfig,
  PomodoroPhase,
  PomodoroSnapshot,
  PomodoroState,
  RestoredPomodoroSession,
} from '../types'

export interface PomodoroPhaseCompleteEvent {
  completedPhase: PomodoroPhase
  nextPhase: PomodoroPhase
}

export interface UsePomodoroTimerOptions {
  initialSession?: RestoredPomodoroSession
  storage?: Storage | null
  now?: () => number
  tickIntervalMs?: number
  onPhaseComplete?: (event: PomodoroPhaseCompleteEvent) => void
}

export interface UsePomodoroTimerResult {
  state: PomodoroState
  snapshot: PomodoroSnapshot
  requiresResume: boolean
  announcement: string | null
  start: () => void
  pause: () => void
  resume: () => void
  toggle: () => void
  reset: () => void
  configure: (config: PomodoroConfig) => void
}

interface CompletionEvent extends PomodoroPhaseCompleteEvent {
  id: number
}

const phaseName = (phase: PomodoroPhase) => phase === 'focus'
  ? 'Focus session'
  : phase === 'short-break'
    ? 'Short break'
    : 'Long break'

export function usePomodoroTimer(
  options: UsePomodoroTimerOptions = {},
): UsePomodoroTimerResult {
  const nowRef = useRef(options.now ?? Date.now)
  const completeRef = useRef(options.onPhaseComplete)
  const storageRef = useRef(options.storage)

  nowRef.current = options.now ?? Date.now
  completeRef.current = options.onPhaseComplete
  storageRef.current = options.storage

  const initialRef = useRef<{ session: RestoredPomodoroSession; now: number } | null>(null)
  if (initialRef.current === null) {
    const initialNow = nowRef.current()
    const session = options.initialSession
      ?? (options.storage === undefined
        ? loadPomodoroSession(undefined, initialNow)
        : loadPomodoroSession(options.storage, initialNow))
    initialRef.current = { session, now: initialNow }
  }

  const [state, setState] = useState(initialRef.current.session.state)
  const stateRef = useRef(state)
  const [nowMs, setNowMs] = useState(initialRef.current.now)
  const [requiresResume, setRequiresResume] = useState(initialRef.current.session.requiresResume)
  const [announcement, setAnnouncement] = useState<string | null>(() => {
    const completedPhase = initialRef.current?.session.completedPhase
    return completedPhase ? `${phaseName(completedPhase)} completed while Chillax was away.` : null
  })
  const [completionEvent, setCompletionEvent] = useState<CompletionEvent | null>(null)
  const completionIdRef = useRef(0)

  const commitState = useCallback((nextState: PomodoroState) => {
    stateRef.current = nextState
    setState(nextState)
  }, [])

  useEffect(() => {
    if (storageRef.current === undefined) {
      savePomodoroState(state)
    } else {
      savePomodoroState(state, storageRef.current)
    }
  }, [state])

  useEffect(() => {
    if (!completionEvent) return
    setAnnouncement(
      `${phaseName(completionEvent.completedPhase)} complete. ${phaseName(completionEvent.nextPhase)} is ready.`,
    )
    completeRef.current?.({
      completedPhase: completionEvent.completedPhase,
      nextPhase: completionEvent.nextPhase,
    })
  }, [completionEvent])

  const reconcile = useCallback(() => {
    const currentNow = nowRef.current()
    const transition = reconcilePomodoroState(stateRef.current, currentNow)
    setNowMs(currentNow)
    if (!transition.advanced || !transition.completedPhase) return

    commitState(transition.state)
    completionIdRef.current += 1
    setCompletionEvent({
      id: completionIdRef.current,
      completedPhase: transition.completedPhase,
      nextPhase: transition.state.phase,
    })
  }, [commitState])

  useEffect(() => {
    if (state.timer.status !== 'running') return

    const requestedInterval = options.tickIntervalMs ?? 1_000
    const tickIntervalMs = Number.isFinite(requestedInterval) && requestedInterval > 0
      ? requestedInterval
      : 1_000
    let intervalId: number | undefined

    const stopInterval = () => {
      if (intervalId === undefined) return
      window.clearInterval(intervalId)
      intervalId = undefined
    }
    const startInterval = () => {
      stopInterval()
      if (document.visibilityState === 'visible') {
        intervalId = window.setInterval(reconcile, tickIntervalMs)
      }
    }
    const handleVisibilityChange = () => {
      reconcile()
      startInterval()
    }

    reconcile()
    startInterval()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      stopInterval()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [options.tickIntervalMs, reconcile, state.timer.status])

  const transition = useCallback((
    update: (currentState: PomodoroState, now: number) => PomodoroState,
    nextAnnouncement: string,
  ) => {
    const currentNow = nowRef.current()
    setNowMs(currentNow)
    setRequiresResume(false)
    commitState(update(stateRef.current, currentNow))
    setAnnouncement(nextAnnouncement)
  }, [commitState])

  const start = useCallback(() => {
    transition(
      (currentState, now) => startPomodoro(currentState, now),
      `${phaseName(stateRef.current.phase)} started.`,
    )
  }, [transition])

  const pause = useCallback(() => {
    transition(
      (currentState, now) => pausePomodoro(currentState, now),
      `${phaseName(stateRef.current.phase)} paused.`,
    )
  }, [transition])

  const resume = useCallback(() => {
    transition(
      (currentState, now) => resumePomodoro(currentState, now),
      `${phaseName(stateRef.current.phase)} resumed.`,
    )
  }, [transition])

  const toggle = useCallback(() => {
    if (stateRef.current.timer.status === 'running') {
      pause()
    } else if (stateRef.current.timer.status === 'paused') {
      resume()
    } else {
      start()
    }
  }, [pause, resume, start])

  const reset = useCallback(() => {
    transition(
      (currentState) => resetPomodoro(currentState),
      'Pomodoro cycle reset.',
    )
  }, [transition])

  const configure = useCallback((config: PomodoroConfig) => {
    transition(
      (currentState) => configurePomodoro(currentState, config),
      'Pomodoro settings updated.',
    )
  }, [transition])

  const snapshot = useMemo(
    () => getPomodoroSnapshot(state, nowMs),
    [nowMs, state],
  )

  return {
    state,
    snapshot,
    requiresResume,
    announcement,
    start,
    pause,
    resume,
    toggle,
    reset,
    configure,
  }
}
