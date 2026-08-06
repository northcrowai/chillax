import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type {
  RestoredSession,
  TimerMode,
  TimerSnapshot,
  TimerState,
  TimerStatus,
} from '../types'
import {
  completeTimer,
  configureTimer,
  getTimerSnapshot,
  pauseTimer,
  resetTimer,
  resumeTimer,
  startTimer,
} from '../lib/timer'
import { loadTimerSession, saveTimerState } from '../lib/storage'

export interface FocusTimerStatusChange {
  status: TimerStatus
  previousStatus: TimerStatus
}

export interface UseFocusTimerOptions {
  initialSession?: RestoredSession
  storage?: Storage | null
  now?: () => number
  tickIntervalMs?: number
  onStatusChange?: (change: FocusTimerStatusChange) => void
  onComplete?: () => void
}

export interface UseFocusTimerResult {
  state: TimerState
  snapshot: TimerSnapshot
  requiresResume: boolean
  announcement: string | null
  start: () => void
  pause: () => void
  resume: () => void
  toggle: () => void
  reset: (mode?: TimerMode, durationMs?: number | null) => void
  configure: (mode: TimerMode, durationMs: number | null) => void
  setDurationMinutes: (minutes: number | null) => void
  complete: () => void
}

const STATUS_ANNOUNCEMENTS: Record<TimerStatus, string> = {
  idle: 'Timer reset.',
  running: 'Focus session started.',
  paused: 'Focus session paused.',
  completed: 'Focus session complete.',
}

export function useFocusTimer(options: UseFocusTimerOptions = {}): UseFocusTimerResult {
  const nowRef = useRef(options.now ?? Date.now)
  const statusChangeRef = useRef(options.onStatusChange)
  const completeRef = useRef(options.onComplete)
  const storageRef = useRef(options.storage)

  nowRef.current = options.now ?? Date.now
  statusChangeRef.current = options.onStatusChange
  completeRef.current = options.onComplete
  storageRef.current = options.storage

  const initialRef = useRef<{ session: RestoredSession; now: number } | null>(null)
  if (initialRef.current === null) {
    const initialNow = nowRef.current()
    const session = options.initialSession
      ?? (options.storage === undefined
        ? loadTimerSession(undefined, initialNow)
        : loadTimerSession(options.storage, initialNow))
    initialRef.current = { session, now: initialNow }
  }

  const [state, setState] = useState<TimerState>(initialRef.current.session.state)
  const [nowMs, setNowMs] = useState(initialRef.current.now)
  const [requiresResume, setRequiresResume] = useState(
    initialRef.current.session.requiresResume,
  )
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const previousStatusRef = useRef(state.status)

  const persist = useCallback((nextState: TimerState) => {
    if (storageRef.current === undefined) {
      saveTimerState(nextState)
    } else {
      saveTimerState(nextState, storageRef.current)
    }
  }, [])

  useEffect(() => {
    persist(state)
  }, [persist, state])

  useEffect(() => {
    const previousStatus = previousStatusRef.current
    if (previousStatus === state.status) {
      return
    }

    previousStatusRef.current = state.status
    setAnnouncement(STATUS_ANNOUNCEMENTS[state.status])
    statusChangeRef.current?.({ status: state.status, previousStatus })

    if (state.status === 'completed') {
      completeRef.current?.()
    }
  }, [state.status])

  const tick = useCallback(() => {
    const currentNow = nowRef.current()
    setNowMs(currentNow)
    setState((currentState) => {
      const currentSnapshot = getTimerSnapshot(currentState, currentNow)
      return currentSnapshot.status === 'completed' && currentState.status === 'running'
        ? completeTimer(currentState, currentNow)
        : currentState
    })
  }, [])

  useEffect(() => {
    if (state.status !== 'running') {
      return
    }

    const requestedInterval = options.tickIntervalMs ?? 1_000
    const tickIntervalMs = Number.isFinite(requestedInterval) && requestedInterval > 0
      ? requestedInterval
      : 1_000
    let intervalId: number | undefined

    const stopInterval = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId)
        intervalId = undefined
      }
    }

    const startInterval = () => {
      stopInterval()
      if (document.visibilityState === 'visible') {
        intervalId = window.setInterval(tick, tickIntervalMs)
      }
    }

    const handleVisibilityChange = () => {
      tick()
      startInterval()
    }

    tick()
    startInterval()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      stopInterval()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [options.tickIntervalMs, state.status, tick])

  const transition = useCallback(
    (update: (currentState: TimerState, now: number) => TimerState) => {
      const currentNow = nowRef.current()
      setNowMs(currentNow)
      setRequiresResume(false)
      setState((currentState) => update(currentState, currentNow))
    },
    [],
  )

  const start = useCallback(() => {
    transition((currentState, now) => startTimer(currentState, now))
  }, [transition])

  const pause = useCallback(() => {
    transition((currentState, now) => pauseTimer(currentState, now))
  }, [transition])

  const resume = useCallback(() => {
    transition((currentState, now) => resumeTimer(currentState, now))
  }, [transition])

  const toggle = useCallback(() => {
    transition((currentState, now) => currentState.status === 'running'
      ? pauseTimer(currentState, now)
      : startTimer(currentState, now))
  }, [transition])

  const reset = useCallback((mode?: TimerMode, durationMs?: number | null) => {
    transition((currentState) => resetTimer(currentState, mode, durationMs))
  }, [transition])

  const configure = useCallback((mode: TimerMode, durationMs: number | null) => {
    transition((currentState) => configureTimer(currentState, mode, durationMs))
  }, [transition])

  const setDurationMinutes = useCallback((minutes: number | null) => {
    if (minutes === null) {
      configure('endless', null)
      return
    }

    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new RangeError('Timer duration must be a positive number of minutes.')
    }

    configure('countdown', minutes * 60_000)
  }, [configure])

  const complete = useCallback(() => {
    transition((currentState, now) => completeTimer(currentState, now))
  }, [transition])

  const snapshot = useMemo(
    () => getTimerSnapshot(state, nowMs),
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
    setDurationMinutes,
    complete,
  }
}
