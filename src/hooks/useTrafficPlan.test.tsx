import { act, renderHook } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_TRAFFIC_PREFERENCES,
  TRAFFIC_PREFERENCES_STORAGE_KEY,
  type TrafficFetch,
} from '../lib/traffic'
import { useTrafficPlan } from './useTrafficPlan'

const MINUTE = 60 * 1000
const ROUTES_KEY = 'test-routes-key'
const MAPS_KEY = 'test-static-maps-key'
const HOME_ADDRESS = '123 Example Home Street'
const MANUAL_ORIGIN = 'Example Starting Point'

const jsonResponse = (payload: unknown, status = 200) => new Response(
  JSON.stringify(payload),
  { status, headers: { 'Content-Type': 'application/json' } },
)

const routePayload = () => ({
  routes: [{
    duration: '1200s',
    staticDuration: '900s',
    distanceMeters: 12_345,
    polyline: { encodedPolyline: 'test-polyline' },
    legs: [{
      startLocation: { latLng: { latitude: 32.8, longitude: -117.1 } },
      endLocation: { latLng: { latitude: 32.9, longitude: -117.2 } },
    }],
  }],
})

const createFetchMock = () => vi.fn<TrafficFetch>(async () => jsonResponse(routePayload()))

const createGeolocation = () => ({
  getCurrentPosition: vi.fn((success: PositionCallback) => success({
    coords: {
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      latitude: 32.8,
      longitude: -117.1,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  })),
})

describe('useTrafficPlan', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('waits for an explicit calculation and keeps GPS and route data out of storage', async () => {
    const fetchImpl = createFetchMock()
    const geolocation = createGeolocation()
    const now = () => new Date(2026, 7, 6, 12, 0)
    const { result } = renderHook(() => useTrafficPlan({
      storage: window.localStorage,
      geolocation,
      fetchImpl,
      now,
      routesApiKey: ROUTES_KEY,
      staticMapsApiKey: MAPS_KEY,
      theme: 'dark',
    }))

    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()

    act(() => {
      result.current.setHomeAddress(HOME_ADDRESS)
      result.current.setArrivalTime('18:00')
    })

    let calculated = false
    await act(async () => {
      calculated = await result.current.calculate()
    })

    expect(calculated).toBe(true)
    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalled()
    expect(result.current.status).toBe('ready')
    expect(result.current.plan).toMatchObject({
      durationSeconds: 1_200,
      staticDurationSeconds: 900,
    })
    expect(result.current.mapUrl).toContain('maps.googleapis.com/maps/api/staticmap')

    const saved = window.localStorage.getItem(TRAFFIC_PREFERENCES_STORAGE_KEY) ?? ''
    expect(JSON.parse(saved)).toEqual({
      version: 1,
      homeAddress: HOME_ADDRESS,
      arrivalTime: '18:00',
      cushionMinutes: 5,
    })
    expect(saved).not.toContain('32.8')
    expect(saved).not.toContain('test-polyline')
    expect(saved).not.toContain(MAPS_KEY)
  })

  it('offers a memory-only manual origin when browser location is denied', async () => {
    const fetchImpl = createFetchMock()
    const geolocation = {
      getCurrentPosition: vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => {
        failure({
          code: 1,
          message: 'Denied',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        })
      }),
    }
    const { result } = renderHook(() => useTrafficPlan({
      storage: window.localStorage,
      geolocation,
      fetchImpl,
      now: () => new Date(2026, 7, 6, 12, 0),
      routesApiKey: ROUTES_KEY,
      staticMapsApiKey: MAPS_KEY,
    }))

    act(() => result.current.setHomeAddress(HOME_ADDRESS))
    await act(async () => {
      await result.current.calculate()
    })

    expect(result.current.needsManualOrigin).toBe(true)
    expect(result.current.error).toContain('Location access is off')
    expect(fetchImpl).not.toHaveBeenCalled()

    act(() => result.current.setManualOrigin(MANUAL_ORIGIN))
    await act(async () => {
      await result.current.calculate({ useManualOrigin: true })
    })

    expect(result.current.plan).not.toBeNull()
    const firstRequest = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as {
      origin?: { address?: string }
    }
    expect(firstRequest.origin?.address).toBe(MANUAL_ORIGIN)

    const saved = window.localStorage.getItem(TRAFFIC_PREFERENCES_STORAGE_KEY) ?? ''
    expect(saved).not.toContain(MANUAL_ORIGIN)
    expect(saved).not.toContain('test-polyline')
  })

  it('fails safely before requesting location when provider keys are missing', async () => {
    const fetchImpl = createFetchMock()
    const geolocation = createGeolocation()
    const { result } = renderHook(() => useTrafficPlan({
      storage: window.localStorage,
      geolocation,
      fetchImpl,
      routesApiKey: '',
      staticMapsApiKey: '',
    }))

    act(() => result.current.setHomeAddress(HOME_ADDRESS))
    await act(async () => {
      await result.current.calculate()
    })

    expect(result.current.isConfigured).toBe(false)
    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('not configured')
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a past arrival time before requesting location', async () => {
    const fetchImpl = createFetchMock()
    const geolocation = createGeolocation()
    const { result } = renderHook(() => useTrafficPlan({
      storage: window.localStorage,
      geolocation,
      fetchImpl,
      now: () => new Date(2026, 7, 6, 12, 0),
      routesApiKey: ROUTES_KEY,
      staticMapsApiKey: MAPS_KEY,
    }))

    act(() => {
      result.current.setHomeAddress(HOME_ADDRESS)
      result.current.setArrivalTime('11:30')
    })
    await act(async () => {
      await result.current.calculate()
    })

    expect(result.current.error).toContain('already passed')
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('invalidates a route after preference edits and resets all traffic state', async () => {
    const fetchImpl = createFetchMock()
    const { result } = renderHook(() => useTrafficPlan({
      storage: window.localStorage,
      geolocation: null,
      fetchImpl,
      now: () => new Date(2026, 7, 6, 12, 0),
      routesApiKey: ROUTES_KEY,
      staticMapsApiKey: MAPS_KEY,
    }))

    act(() => {
      result.current.setHomeAddress(HOME_ADDRESS)
      result.current.setManualOrigin(MANUAL_ORIGIN)
    })
    await act(async () => {
      await result.current.calculate({ useManualOrigin: true })
    })
    expect(result.current.plan).not.toBeNull()

    act(() => result.current.setCushionMinutes(10))
    expect(result.current.plan).toBeNull()
    expect(result.current.status).toBe('idle')

    act(() => result.current.reset())
    expect(result.current.preferences).toEqual(DEFAULT_TRAFFIC_PREFERENCES)
    expect(result.current.manualOrigin).toBe('')
    expect(result.current.plan).toBeNull()
    expect(window.localStorage.getItem(TRAFFIC_PREFERENCES_STORAGE_KEY)).toBeNull()
  })

  it('refreshes at ten-minute intervals near departure and stops after the target', async () => {
    vi.useFakeTimers()
    let currentMs = new Date(2026, 7, 6, 12, 0).getTime()
    const fetchImpl = createFetchMock()
    const { result } = renderHook(() => useTrafficPlan({
      storage: window.localStorage,
      geolocation: null,
      fetchImpl,
      now: () => new Date(currentMs),
      routesApiKey: ROUTES_KEY,
      staticMapsApiKey: MAPS_KEY,
      autoRefreshMs: 10 * MINUTE,
    }))

    act(() => {
      result.current.setHomeAddress(HOME_ADDRESS)
      result.current.setArrivalTime('15:00')
      result.current.setManualOrigin(MANUAL_ORIGIN)
    })
    await act(async () => {
      await result.current.calculate({ useManualOrigin: true })
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    currentMs += 9 * MINUTE
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9 * MINUTE)
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    currentMs += MINUTE
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MINUTE)
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(result.current.status).toBe('ready')

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    currentMs += 10 * MINUTE
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * MINUTE)
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(fetchImpl).toHaveBeenCalledTimes(4)

    currentMs = new Date(2026, 7, 6, 15, 0).getTime()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * MINUTE)
    })
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('reacquires GPS coordinates before an automatic refresh', async () => {
    vi.useFakeTimers()
    let currentMs = new Date(2026, 7, 6, 12, 0).getTime()
    const locations = [
      { latitude: 32.8, longitude: -117.1 },
      { latitude: 33.1, longitude: -117.3 },
    ]
    let locationIndex = 0
    const geolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        const location = locations[Math.min(locationIndex, locations.length - 1)]
        locationIndex += 1
        success({
          coords: {
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            ...location,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: currentMs,
          toJSON: () => ({}),
        })
      }),
    }
    const fetchImpl = createFetchMock()
    const { result } = renderHook(() => useTrafficPlan({
      storage: window.localStorage,
      geolocation,
      fetchImpl,
      now: () => new Date(currentMs),
      routesApiKey: ROUTES_KEY,
      staticMapsApiKey: MAPS_KEY,
      autoRefreshMs: 10 * MINUTE,
    }))

    act(() => {
      result.current.setHomeAddress(HOME_ADDRESS)
      result.current.setArrivalTime('15:00')
    })
    await act(async () => {
      await result.current.calculate()
    })
    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1)

    currentMs += 10 * MINUTE
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * MINUTE)
    })

    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(2)
    const latestRequest = JSON.parse(String(fetchImpl.mock.lastCall?.[1]?.body)) as {
      origin?: { location?: { latLng?: { latitude?: number; longitude?: number } } }
    }
    expect(latestRequest.origin?.location?.latLng).toEqual(locations[1])
  })

  it('times out a route request that never responds', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn<TrafficFetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    }))
    const { result } = renderHook(() => useTrafficPlan({
      storage: window.localStorage,
      geolocation: null,
      fetchImpl,
      now: () => new Date(2026, 7, 6, 12, 0),
      routesApiKey: ROUTES_KEY,
      staticMapsApiKey: MAPS_KEY,
    }))

    act(() => {
      result.current.setHomeAddress(HOME_ADDRESS)
      result.current.setManualOrigin(MANUAL_ORIGIN)
    })
    await act(async () => {
      const calculation = result.current.calculate({ useManualOrigin: true })
      await vi.advanceTimersByTimeAsync(20 * 1000)
      await calculation
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('too long to respond')
  })
})
