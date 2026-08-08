import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  buildStaticMapUrl,
  clearTrafficPreferences,
  DEFAULT_TRAFFIC_PREFERENCES,
  getPlannedTrafficDrive,
  loadTrafficPreferences,
  saveTrafficPreferences,
  solveTrafficRoute,
  type TrafficCushionMinutes,
  type TrafficFetch,
  type TrafficMapTheme,
  type TrafficOrigin,
  type TrafficPlan,
  type TrafficPreferences,
} from '../lib/traffic'

// A traffic-aware route can make several Google Routes calls while it refines
// the leave time. Refresh only once an hour, and only near a real commute.
const AUTO_REFRESH_MS = 60 * 60 * 1000
const AUTO_REFRESH_WINDOW_MS = 3 * 60 * 60 * 1000
const SCHEDULER_TICK_MS = 60 * 1000
const ROUTE_REQUEST_TIMEOUT_MS = 20 * 1000

export type TrafficPlanStatus =
  | 'idle'
  | 'locating'
  | 'loading'
  | 'refreshing'
  | 'ready'
  | 'error'

export interface UseTrafficPlanOptions {
  theme?: TrafficMapTheme
  storage?: Storage | null
  fetchImpl?: TrafficFetch
  now?: () => Date
  routesApiKey?: string
  staticMapsApiKey?: string
  autoRefreshMs?: number
}

interface InternalCalculateTrafficOptions {
  automatic?: boolean
}

const getBrowserStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const getCurrentDate = () => new Date()

const isAutomaticTrafficDay = (date: Date) => {
  const day = date.getDay()
  return day !== 0 && day !== 6
}

const configurationMessage =
  'Traffic is not configured yet. Add the Google Maps keys to enable route planning.'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : 'Traffic could not calculate this drive. Please try again.'

const isAbortError = (error: unknown): boolean =>
  typeof error === 'object'
  && error !== null
  && 'name' in error
  && error.name === 'AbortError'

export function useTrafficPlan(options: UseTrafficPlanOptions = {}) {
  const storage = options.storage === undefined ? getBrowserStorage() : options.storage
  const now = options.now ?? getCurrentDate
  const routesApiKey = options.routesApiKey
    ?? import.meta.env.VITE_GOOGLE_ROUTES_API_KEY
    ?? ''
  const staticMapsApiKey = options.staticMapsApiKey
    ?? import.meta.env.VITE_GOOGLE_STATIC_MAPS_API_KEY
    ?? ''
  const autoRefreshMs = options.autoRefreshMs !== undefined
    && Number.isFinite(options.autoRefreshMs)
    && options.autoRefreshMs > 0
    ? options.autoRefreshMs
    : AUTO_REFRESH_MS

  const [preferences, setPreferences] = useState<TrafficPreferences>(
    () => loadTrafficPreferences(storage),
  )
  const [plan, setPlan] = useState<TrafficPlan | null>(null)
  const [status, setStatus] = useState<TrafficPlanStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const requestSequenceRef = useRef(0)
  const pendingRef = useRef(false)
  const requestControllerRef = useRef<AbortController | null>(null)
  const lastOriginRef = useRef<TrafficOrigin | null>(null)
  const lastRefreshAttemptRef = useRef(0)
  const hiddenSinceRef = useRef<number | null>(null)
  const didAutoCalculateOnOpenRef = useRef(false)

  const isConfigured = routesApiKey.trim().length > 0
    && staticMapsApiKey.trim().length > 0

  const cancelPendingRequest = useCallback(() => {
    requestSequenceRef.current += 1
    pendingRef.current = false
    requestControllerRef.current?.abort()
    requestControllerRef.current = null
  }, [])

  const invalidatePlan = useCallback(() => {
    cancelPendingRequest()
    setPlan(null)
    setStatus('idle')
    setError(null)
    lastOriginRef.current = null
    lastRefreshAttemptRef.current = 0
  }, [cancelPendingRequest])

  const updatePreferences = useCallback((
    update: (current: TrafficPreferences) => TrafficPreferences,
  ) => {
    invalidatePlan()
    setPreferences((current) => {
      const next = update(current)
      saveTrafficPreferences(next, storage)
      return next
    })
  }, [invalidatePlan, storage])

  const setHomeAddress = useCallback((homeAddress: string) => {
    updatePreferences((current) => ({ ...current, homeAddress }))
  }, [updatePreferences])

  const setHomeArrivalTime = useCallback((homeArrivalTime: string) => {
    updatePreferences((current) => ({ ...current, homeArrivalTime }))
  }, [updatePreferences])

  const setWorkAddress = useCallback((workAddress: string) => {
    updatePreferences((current) => ({ ...current, workAddress }))
  }, [updatePreferences])

  const setWorkArrivalTime = useCallback((workArrivalTime: string) => {
    updatePreferences((current) => ({ ...current, workArrivalTime }))
  }, [updatePreferences])

  const setCushionMinutes = useCallback((cushionMinutes: TrafficCushionMinutes) => {
    updatePreferences((current) => ({ ...current, cushionMinutes }))
  }, [updatePreferences])

  const calculateInternal = useCallback(async (
    calculateOptions: InternalCalculateTrafficOptions = {},
  ): Promise<boolean> => {
    if (pendingRef.current) return false

    const automatic = calculateOptions.automatic === true
    const calculationStartedAt = now()
    if (automatic && !isAutomaticTrafficDay(calculationStartedAt)) return false
    if (!isConfigured) {
      if (!automatic) {
        setStatus('error')
        setError(configurationMessage)
      }
      return false
    }

    let drive
    try {
      drive = getPlannedTrafficDrive(preferences, calculationStartedAt)
    } catch (driveError) {
      if (!automatic) {
        setStatus('error')
        setError(getErrorMessage(driveError))
      }
      return false
    }
    if (!drive.originAddress || !drive.destinationAddress) {
      if (!automatic) {
        setStatus('error')
        setError('Enter both your Home and Work addresses before calculating the drive.')
      }
      return false
    }

    const requestId = requestSequenceRef.current + 1
    requestSequenceRef.current = requestId
    pendingRef.current = true
    lastRefreshAttemptRef.current = calculationStartedAt.getTime()

    const origin: TrafficOrigin = { kind: 'address', address: drive.originAddress }
    let routeTimedOut = false
    let routeTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null
    try {
      if (requestId !== requestSequenceRef.current) return false

      const controller = new AbortController()
      requestControllerRef.current = controller
      routeTimeoutId = globalThis.setTimeout(() => {
        routeTimedOut = true
        controller.abort()
      }, ROUTE_REQUEST_TIMEOUT_MS)
      setStatus(automatic ? 'refreshing' : 'loading')
      if (!automatic) setError(null)

      const nextPlan = await solveTrafficRoute({
        origin,
        homeAddress: drive.destinationAddress,
        desiredArrival: drive.desiredArrival,
        bufferMinutes: preferences.cushionMinutes,
        apiKey: routesApiKey,
        seedDurationSeconds: plan?.durationSeconds,
        signal: controller.signal,
        fetchImpl: options.fetchImpl,
        now: now(),
      })

      if (requestId !== requestSequenceRef.current) return false

      lastOriginRef.current = origin
      setPlan(nextPlan)
      setStatus('ready')
      setError(null)
      return true
    } catch (calculationError) {
      if (requestId !== requestSequenceRef.current) {
        return false
      }
      if (isAbortError(calculationError)) {
        if (routeTimedOut) {
          setStatus('error')
          setError('Google Maps took too long to respond. Please try again.')
        }
        return false
      }
      setStatus('error')
      setError(getErrorMessage(calculationError))
      return false
    } finally {
      if (routeTimeoutId !== null) globalThis.clearTimeout(routeTimeoutId)
      if (requestId === requestSequenceRef.current) {
        pendingRef.current = false
        requestControllerRef.current = null
      }
    }
  }, [
    isConfigured,
    now,
    options.fetchImpl,
    plan?.durationSeconds,
    preferences,
    routesApiKey,
  ])

  const calculate = useCallback(() => calculateInternal(), [calculateInternal])

  // A route result is intentionally not persisted, so a saved commute needs a
  // fresh estimate after the app opens. This runs at most once per app session;
  // subsequent automatic calls are limited by the hourly, commute-aware gate.
  useEffect(() => {
    if (didAutoCalculateOnOpenRef.current) return
    didAutoCalculateOnOpenRef.current = true
    void calculateInternal({ automatic: true })
  }, [calculateInternal])

  const reset = useCallback(() => {
    cancelPendingRequest()
    clearTrafficPreferences(storage)
    setPreferences({ ...DEFAULT_TRAFFIC_PREFERENCES })
    setPlan(null)
    setStatus('idle')
    setError(null)
    lastOriginRef.current = null
    lastRefreshAttemptRef.current = 0
    hiddenSinceRef.current = null
  }, [cancelPendingRequest, storage])

  const mapUrl = useMemo(() => {
    if (!plan || staticMapsApiKey.trim().length === 0) return null
    try {
      return buildStaticMapUrl({
        plan,
        apiKey: staticMapsApiKey,
        theme: options.theme ?? 'dark',
      })
    } catch {
      return null
    }
  }, [options.theme, plan, staticMapsApiKey])

  const shouldAutoRefresh = useCallback((): boolean => {
    if (!plan || pendingRef.current) return false
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false

    const current = now()
    if (!isAutomaticTrafficDay(current)) return false
    const currentMs = current.getTime()
    const leaveByMs = Date.parse(plan.leaveBy)
    const targetMs = Date.parse(plan.desiredArrivalTime)
    let nextTargetMs: number
    try {
      nextTargetMs = getPlannedTrafficDrive(preferences, current).desiredArrival.getTime()
    } catch {
      return false
    }
    if (!Number.isFinite(currentMs)
      || !Number.isFinite(leaveByMs)
      || !Number.isFinite(targetMs)
      || !Number.isFinite(nextTargetMs)) return false

    const fetchedAtMs = Date.parse(plan.fetchedAt)
    const lastActivityMs = Math.max(
      Number.isFinite(fetchedAtMs) ? fetchedAtMs : 0,
      lastRefreshAttemptRef.current,
    )

    // Once a commute ends, switch once to the next scheduled trip. An hourly
    // cooldown still applies, so a temporary Google error cannot cause retries
    // every scheduler tick.
    if (nextTargetMs !== targetMs) return currentMs - lastActivityMs >= autoRefreshMs

    if (currentMs >= targetMs
      || currentMs < leaveByMs - AUTO_REFRESH_WINDOW_MS) {
      return false
    }

    return currentMs - lastActivityMs >= autoRefreshMs
  }, [autoRefreshMs, now, plan, preferences])

  useEffect(() => {
    if (!plan || !lastOriginRef.current) return

    const refreshIfDue = () => {
      if (shouldAutoRefresh()) {
        void calculateInternal({ automatic: true })
      }
    }
    const handleVisibilityChange = () => {
      const currentMs = now().getTime()
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = currentMs
        return
      }

      const hiddenSince = hiddenSinceRef.current
      hiddenSinceRef.current = null
      if (hiddenSince !== null && currentMs - hiddenSince >= autoRefreshMs) {
        refreshIfDue()
      }
    }
    const schedulerId = window.setInterval(
      refreshIfDue,
      Math.min(autoRefreshMs, SCHEDULER_TICK_MS),
    )

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', refreshIfDue)
    return () => {
      window.clearInterval(schedulerId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', refreshIfDue)
    }
  }, [autoRefreshMs, calculateInternal, now, plan, shouldAutoRefresh])

  useEffect(() => () => {
    requestControllerRef.current?.abort()
    requestControllerRef.current = null
    pendingRef.current = false
  }, [])

  const isStale = plan !== null
    && now().getTime() - Date.parse(plan.fetchedAt) >= autoRefreshMs
  const drive = getPlannedTrafficDrive(preferences, now())

  return {
    preferences,
    drive,
    plan,
    mapUrl,
    status,
    error,
    isConfigured,
    isStale,
    setHomeAddress,
    setHomeArrivalTime,
    setWorkAddress,
    setWorkArrivalTime,
    setCushionMinutes,
    calculate,
    reset,
  }
}
