import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  buildStaticMapUrl,
  clearTrafficPreferences,
  DEFAULT_TRAFFIC_PREFERENCES,
  getTodayArrival,
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

const AUTO_REFRESH_MS = 10 * 60 * 1000
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

export interface CalculateTrafficOptions {
  useManualOrigin?: boolean
}

export interface UseTrafficPlanOptions {
  theme?: TrafficMapTheme
  storage?: Storage | null
  geolocation?: Pick<Geolocation, 'getCurrentPosition'> | null
  fetchImpl?: TrafficFetch
  now?: () => Date
  routesApiKey?: string
  staticMapsApiKey?: string
  autoRefreshMs?: number
}

interface InternalCalculateTrafficOptions extends CalculateTrafficOptions {
  automatic?: boolean
}

const getBrowserStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const getBrowserGeolocation = (): Pick<Geolocation, 'getCurrentPosition'> | null => {
  try {
    return typeof navigator === 'undefined' ? null : navigator.geolocation ?? null
  } catch {
    return null
  }
}

const getCurrentDate = () => new Date()

const configurationMessage =
  'Traffic is not configured yet. Add the Google Maps keys to enable route planning.'

const locationMessage =
  'Current location is unavailable. Enter a starting address instead.'

const deniedLocationMessage =
  'Location access is off. Enter a starting address instead.'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : 'Traffic could not calculate this drive. Please try again.'

const requestCoordinates = (
  geolocation: Pick<Geolocation, 'getCurrentPosition'>,
): Promise<TrafficOrigin> => new Promise((resolve, reject) => {
  geolocation.getCurrentPosition(
    (position) => resolve({
      kind: 'coordinates',
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    }),
    reject,
    {
      enableHighAccuracy: false,
      maximumAge: 2 * 60 * 1000,
      timeout: 10 * 1000,
    },
  )
})

const isPermissionDenied = (error: unknown): boolean =>
  typeof error === 'object'
  && error !== null
  && 'code' in error
  && error.code === 1

const isAbortError = (error: unknown): boolean =>
  typeof error === 'object'
  && error !== null
  && 'name' in error
  && error.name === 'AbortError'

export function useTrafficPlan(options: UseTrafficPlanOptions = {}) {
  const storage = options.storage === undefined ? getBrowserStorage() : options.storage
  const geolocation = options.geolocation === undefined
    ? getBrowserGeolocation()
    : options.geolocation
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
  const [needsManualOrigin, setNeedsManualOrigin] = useState(false)
  const [manualOrigin, setManualOriginState] = useState('')

  const requestSequenceRef = useRef(0)
  const pendingRef = useRef(false)
  const requestControllerRef = useRef<AbortController | null>(null)
  const lastOriginRef = useRef<TrafficOrigin | null>(null)
  const lastRefreshAttemptRef = useRef(0)
  const hiddenSinceRef = useRef<number | null>(null)

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

  const setArrivalTime = useCallback((arrivalTime: string) => {
    updatePreferences((current) => ({ ...current, arrivalTime }))
  }, [updatePreferences])

  const setCushionMinutes = useCallback((cushionMinutes: TrafficCushionMinutes) => {
    updatePreferences((current) => ({ ...current, cushionMinutes }))
  }, [updatePreferences])

  const setManualOrigin = useCallback((value: string) => {
    invalidatePlan()
    setManualOriginState(value)
  }, [invalidatePlan])

  const calculateInternal = useCallback(async (
    calculateOptions: InternalCalculateTrafficOptions = {},
  ): Promise<boolean> => {
    if (pendingRef.current) return false

    const automatic = calculateOptions.automatic === true
    if (!isConfigured) {
      if (!automatic) {
        setStatus('error')
        setError(configurationMessage)
      }
      return false
    }

    const homeAddress = preferences.homeAddress.trim()
    if (!homeAddress) {
      if (!automatic) {
        setStatus('error')
        setError('Enter your Home address before calculating the drive.')
      }
      return false
    }

    const calculationStartedAt = now()
    let desiredArrival: Date
    try {
      desiredArrival = getTodayArrival(preferences.arrivalTime, calculationStartedAt)
    } catch (arrivalError) {
      if (!automatic) {
        setStatus('error')
        setError(getErrorMessage(arrivalError))
      }
      return false
    }
    if (desiredArrival.getTime() <= calculationStartedAt.getTime()) {
      if (!automatic) {
        setStatus('error')
        setError('That arrival time has already passed. Choose a later time today.')
      }
      return false
    }

    const requestId = requestSequenceRef.current + 1
    requestSequenceRef.current = requestId
    pendingRef.current = true
    lastRefreshAttemptRef.current = calculationStartedAt.getTime()

    let origin: TrafficOrigin
    let routeTimedOut = false
    let routeTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null
    try {
      if (automatic) {
        const previousOrigin = lastOriginRef.current
        if (!previousOrigin) return false
        if (previousOrigin.kind === 'address') {
          origin = previousOrigin
        } else {
          if (!geolocation) {
            setNeedsManualOrigin(true)
            setStatus('error')
            setError(locationMessage)
            return false
          }
          try {
            origin = await requestCoordinates(geolocation)
          } catch (locationError) {
            if (requestId !== requestSequenceRef.current) return false
            setNeedsManualOrigin(true)
            setStatus('error')
            setError(isPermissionDenied(locationError)
              ? deniedLocationMessage
              : locationMessage)
            return false
          }
        }
      } else if (calculateOptions.useManualOrigin) {
        const address = manualOrigin.trim()
        if (!address) {
          setNeedsManualOrigin(true)
          setStatus('error')
          setError('Enter a starting address before calculating the drive.')
          return false
        }
        origin = { kind: 'address', address }
      } else {
        setStatus('locating')
        setError(null)
        if (!geolocation) {
          setNeedsManualOrigin(true)
          setStatus('error')
          setError(locationMessage)
          return false
        }

        try {
          origin = await requestCoordinates(geolocation)
        } catch (locationError) {
          if (requestId !== requestSequenceRef.current) return false
          setNeedsManualOrigin(true)
          setStatus('error')
          setError(isPermissionDenied(locationError)
            ? deniedLocationMessage
            : locationMessage)
          return false
        }
      }

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
        homeAddress,
        desiredArrival,
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
      setNeedsManualOrigin(false)
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
    geolocation,
    isConfigured,
    manualOrigin,
    now,
    options.fetchImpl,
    plan?.durationSeconds,
    preferences,
    routesApiKey,
  ])

  const calculate = useCallback(
    (calculateOptions?: CalculateTrafficOptions) => calculateInternal(calculateOptions),
    [calculateInternal],
  )

  const reset = useCallback(() => {
    cancelPendingRequest()
    clearTrafficPreferences(storage)
    setPreferences({ ...DEFAULT_TRAFFIC_PREFERENCES })
    setPlan(null)
    setStatus('idle')
    setError(null)
    setNeedsManualOrigin(false)
    setManualOriginState('')
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

    const currentMs = now().getTime()
    const leaveByMs = Date.parse(plan.leaveBy)
    const targetMs = Date.parse(plan.desiredArrivalTime)
    if (!Number.isFinite(currentMs)
      || !Number.isFinite(leaveByMs)
      || !Number.isFinite(targetMs)
      || currentMs >= targetMs
      || currentMs < leaveByMs - AUTO_REFRESH_WINDOW_MS) {
      return false
    }

    const fetchedAtMs = Date.parse(plan.fetchedAt)
    const lastActivityMs = Math.max(
      Number.isFinite(fetchedAtMs) ? fetchedAtMs : 0,
      lastRefreshAttemptRef.current,
    )
    return currentMs - lastActivityMs >= autoRefreshMs
  }, [autoRefreshMs, now, plan])

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

  return {
    preferences,
    plan,
    mapUrl,
    status,
    error,
    needsManualOrigin,
    manualOrigin,
    isConfigured,
    isStale,
    setHomeAddress,
    setArrivalTime,
    setCushionMinutes,
    setManualOrigin,
    calculate,
    reset,
  }
}
