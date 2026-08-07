import { act, renderHook } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRAFFIC_PREFERENCES_STORAGE_KEY, type TrafficFetch } from '../lib/traffic'
import { useTrafficPlan } from './useTrafficPlan'

const jsonResponse = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

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

describe('useTrafficPlan', () => {
  beforeEach(() => window.localStorage.clear())

  it('plans tomorrow morning from Home to Work and persists only the schedule', async () => {
    const fetchImpl = createFetchMock()
    const now = () => new Date(2026, 7, 6, 19, 0)
    const { result } = renderHook(() => useTrafficPlan({
      storage: window.localStorage,
      fetchImpl,
      now,
      routesApiKey: 'test-routes-key',
      staticMapsApiKey: 'test-static-maps-key',
    }))

    act(() => {
      result.current.setHomeAddress('123 Example Home Street')
      result.current.setHomeArrivalTime('18:00')
      result.current.setWorkAddress('456 Example Work Way')
      result.current.setWorkArrivalTime('09:00')
    })
    await act(async () => { await result.current.calculate() })

    expect(result.current.drive).toMatchObject({
      dayLabel: 'Tomorrow',
      routeLabel: 'Home to Work',
      arrivalLabel: 'Arrive at work',
    })
    expect(result.current.plan).not.toBeNull()
    const request = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as {
      origin?: { address?: string }
      destination?: { address?: string }
    }
    expect(request.origin?.address).toBe('123 Example Home Street')
    expect(request.destination?.address).toBe('456 Example Work Way')

    expect(JSON.parse(window.localStorage.getItem(TRAFFIC_PREFERENCES_STORAGE_KEY) ?? '{}')).toEqual({
      version: 2,
      homeAddress: '123 Example Home Street',
      homeArrivalTime: '18:00',
      workAddress: '456 Example Work Way',
      workArrivalTime: '09:00',
      cushionMinutes: 5,
    })
  })

  it('switches to Work to Home after the work arrival time and clears a route after edits', async () => {
    const fetchImpl = createFetchMock()
    const { result } = renderHook(() => useTrafficPlan({
      storage: window.localStorage,
      fetchImpl,
      now: () => new Date(2026, 7, 6, 12, 0),
      routesApiKey: 'test-routes-key',
      staticMapsApiKey: 'test-static-maps-key',
    }))
    act(() => {
      result.current.setHomeAddress('123 Example Home Street')
      result.current.setWorkAddress('456 Example Work Way')
    })
    await act(async () => { await result.current.calculate() })
    expect(result.current.drive.routeLabel).toBe('Work to Home')
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
      origin: { address: '456 Example Work Way' },
      destination: { address: '123 Example Home Street' },
    })

    act(() => result.current.setHomeArrivalTime('17:30'))
    expect(result.current.plan).toBeNull()
    expect(result.current.status).toBe('idle')
  })

  it('requires both addresses before making a paid route request', async () => {
    const fetchImpl = createFetchMock()
    const { result } = renderHook(() => useTrafficPlan({
      storage: window.localStorage,
      fetchImpl,
      routesApiKey: 'test-routes-key',
      staticMapsApiKey: 'test-static-maps-key',
    }))
    await act(async () => { await result.current.calculate() })
    expect(result.current.error).toContain('Home and Work')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
