import type {
  RestoredSession,
  TimerMode,
  TimerSnapshot,
  TimerState,
} from '../types'

export const MINUTE_MS = 60_000
export const DEFAULT_DURATION_MS = 50 * MINUTE_MS

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

const requireTimestamp = (now: number) => {
  if (!Number.isFinite(now) || now < 0) {
    throw new RangeError('Timer timestamps must be finite, non-negative numbers.')
  }
}

const requireConfiguration = (mode: TimerMode, durationMs: number | null) => {
  if (mode === 'countdown') {
    if (!Number.isFinite(durationMs) || (durationMs ?? 0) <= 0) {
      throw new RangeError('Countdown timers require a positive duration.')
    }
    return
  }

  if (durationMs !== null) {
    throw new RangeError('Endless timers cannot have a duration.')
  }
}

export function createTimerState(
  mode: TimerMode = 'countdown',
  durationMs: number | null = mode === 'countdown' ? DEFAULT_DURATION_MS : null,
): TimerState {
  requireConfiguration(mode, durationMs)

  return {
    version: 1,
    mode,
    status: 'idle',
    durationMs,
    startedAt: null,
    endAt: null,
    elapsedBeforeStartMs: 0,
    remainingWhenPausedMs: mode === 'countdown' ? durationMs : null,
  }
}

export function resetTimer(
  state: TimerState,
  mode: TimerMode = state.mode,
  durationMs: number | null = mode === state.mode
    ? state.durationMs
    : mode === 'countdown'
      ? DEFAULT_DURATION_MS
      : null,
): TimerState {
  return createTimerState(mode, durationMs)
}

export function configureTimer(
  state: TimerState,
  mode: TimerMode,
  durationMs: number | null,
): TimerState {
  return resetTimer(state, mode, durationMs)
}

export function startTimer(state: TimerState, now: number): TimerState {
  requireTimestamp(now)

  if (state.status === 'running') {
    return state
  }

  const baseState = state.status === 'completed' ? resetTimer(state) : state

  if (baseState.mode === 'endless') {
    return {
      ...baseState,
      status: 'running',
      startedAt: now,
      endAt: null,
      remainingWhenPausedMs: null,
    }
  }

  const durationMs = baseState.durationMs as number
  const remainingMs = baseState.status === 'paused'
    ? clamp(baseState.remainingWhenPausedMs ?? durationMs, 0, durationMs)
    : durationMs

  if (remainingMs === 0) {
    return completeTimer(baseState, now)
  }

  return {
    ...baseState,
    status: 'running',
    startedAt: now,
    endAt: now + remainingMs,
    remainingWhenPausedMs: null,
  }
}

export function resumeTimer(state: TimerState, now: number): TimerState {
  if (state.status !== 'paused') {
    return state
  }

  return startTimer(state, now)
}

export function pauseTimer(state: TimerState, now: number): TimerState {
  requireTimestamp(now)

  if (state.status !== 'running') {
    return state
  }

  if (state.mode === 'endless') {
    const activeElapsedMs = Math.max(0, now - (state.startedAt ?? now))

    return {
      ...state,
      status: 'paused',
      startedAt: null,
      endAt: null,
      elapsedBeforeStartMs: state.elapsedBeforeStartMs + activeElapsedMs,
      remainingWhenPausedMs: null,
    }
  }

  const durationMs = state.durationMs as number
  const maximumRemainingMs = Math.max(0, durationMs - state.elapsedBeforeStartMs)
  const remainingMs = clamp((state.endAt ?? now) - now, 0, maximumRemainingMs)

  if (remainingMs === 0) {
    return completeTimer(state, now)
  }

  return {
    ...state,
    status: 'paused',
    startedAt: null,
    endAt: null,
    elapsedBeforeStartMs: durationMs - remainingMs,
    remainingWhenPausedMs: remainingMs,
  }
}

export function completeTimer(state: TimerState, now: number): TimerState {
  requireTimestamp(now)

  if (state.mode === 'endless') {
    const activeElapsedMs = state.status === 'running'
      ? Math.max(0, now - (state.startedAt ?? now))
      : 0

    return {
      ...state,
      status: 'completed',
      startedAt: null,
      endAt: null,
      elapsedBeforeStartMs: state.elapsedBeforeStartMs + activeElapsedMs,
      remainingWhenPausedMs: null,
    }
  }

  return {
    ...state,
    status: 'completed',
    startedAt: null,
    endAt: null,
    elapsedBeforeStartMs: state.durationMs as number,
    remainingWhenPausedMs: 0,
  }
}

export function getTimerSnapshot(state: TimerState, now: number): TimerSnapshot {
  requireTimestamp(now)

  if (state.mode === 'endless') {
    const activeElapsedMs = state.status === 'running'
      ? Math.max(0, now - (state.startedAt ?? now))
      : 0

    return {
      status: state.status,
      mode: state.mode,
      displayMs: state.elapsedBeforeStartMs + activeElapsedMs,
      progress: null,
    }
  }

  const durationMs = state.durationMs as number
  let displayMs: number

  if (state.status === 'idle') {
    displayMs = durationMs
  } else if (state.status === 'running') {
    const maximumRemainingMs = Math.max(0, durationMs - state.elapsedBeforeStartMs)
    displayMs = clamp((state.endAt ?? now) - now, 0, maximumRemainingMs)
  } else if (state.status === 'paused') {
    displayMs = clamp(state.remainingWhenPausedMs ?? 0, 0, durationMs)
  } else {
    displayMs = 0
  }

  const isExpired = state.status === 'running' && displayMs === 0

  return {
    status: isExpired ? 'completed' : state.status,
    mode: state.mode,
    displayMs,
    progress: clamp(1 - displayMs / durationMs, 0, 1),
  }
}

export function restoreTimerState(state: TimerState, now: number): RestoredSession {
  requireTimestamp(now)

  if (state.status !== 'running') {
    return { state, requiresResume: false }
  }

  const snapshot = getTimerSnapshot(state, now)
  if (snapshot.status === 'completed') {
    return {
      state: completeTimer(state, now),
      requiresResume: false,
    }
  }

  return {
    state: pauseTimer(state, now),
    requiresResume: true,
  }
}
