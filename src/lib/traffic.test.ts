import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_TRAFFIC_PREFERENCES,
  GOOGLE_ROUTES_ENDPOINT,
  GOOGLE_ROUTES_FIELD_MASK,
  TRAFFIC_PREFERENCES_STORAGE_KEY,
  TrafficError,
  buildStaticMapUrl,
  clearTrafficPreferences,
  getPlannedTrafficDrive,
  getTodayArrival,
  loadTrafficPreferences,
  saveTrafficPreferences,
  solveTrafficRoute,
} from './traffic'
import type {
  SolveTrafficRouteOptions,
  TrafficFetch,
  TrafficPlan,
  TrafficPreferences,
} from './traffic'

const jsonResponse = (payload: unknown, status = 200) => new Response(
  JSON.stringify(payload),
  {
    status,
    headers: { 'Content-Type': 'application/json' },
  },
)

const dateAt = (hours: number, minutes = 0) =>
  new Date(2026, 7, 6, hours, minutes, 0, 0)

const makeRoutePayload = (
  durationSeconds = 1_800,
  staticDurationSeconds = Math.max(1, durationSeconds - 300),
) => ({
  routes: [{
    duration: `${durationSeconds}s`,
    staticDuration: `${staticDurationSeconds}s`,
    distanceMeters: 18_642,
    polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
    legs: [{
      startLocation: { latLng: { latitude: 32.71, longitude: -117.16 } },
      endLocation: { latLng: { latitude: 32.82, longitude: -117.09 } },
    }],
    viewport: {
      low: { latitude: 32.71, longitude: -117.16 },
      high: { latitude: 32.82, longitude: -117.09 },
    },
  }],
})

const makeSolveOptions = (
  fetchImpl: TrafficFetch,
  overrides: Partial<SolveTrafficRouteOptions> = {},
): SolveTrafficRouteOptions => ({
  origin: { kind: 'coordinates', latitude: 32.71, longitude: -117.16 },
  homeAddress: 'Home destination',
  desiredArrival: dateAt(18),
  bufferMinutes: 5,
  apiKey: 'test-browser-routes-key',
  fetchImpl,
  now: dateAt(12),
  ...overrides,
})

class CountingStorage implements Storage {
  private readonly values = new Map<string, string>()
  writes = 0

  get length(): number {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.writes += 1
    this.values.set(key, value)
  }
}

class ThrowingStorage implements Storage {
  get length(): number {
    throw new Error('Storage is blocked')
  }

  clear() {
    throw new Error('Storage is blocked')
  }

  getItem(_key: string): string | null {
    throw new Error('Storage is blocked')
  }

  key(_index: number): string | null {
    throw new Error('Storage is blocked')
  }

  removeItem(_key: string) {
    throw new Error('Storage is blocked')
  }

  setItem(_key: string, _value: string) {
    throw new Error('Storage is blocked')
  }
}

describe('traffic preferences storage', () => {
  it('returns independent setup defaults when storage is unavailable or empty', () => {
    const first = loadTrafficPreferences(null)
    first.homeAddress = 'Changed locally'

    expect(loadTrafficPreferences(new CountingStorage())).toEqual({
      version: 2,
      homeAddress: '',
      homeArrivalTime: '18:00',
      workAddress: '',
      workArrivalTime: '09:00',
      cushionMinutes: 5,
    })
    expect(loadTrafficPreferences(null)).toEqual(DEFAULT_TRAFFIC_PREFERENCES)
    expect(saveTrafficPreferences(DEFAULT_TRAFFIC_PREFERENCES, null)).toBe(false)
  })

  it('round-trips only user inputs, normalizes Home, and avoids duplicate writes', () => {
    const storage = new CountingStorage()
    const preferences: TrafficPreferences = {
      version: 2,
      homeAddress: '  100   Example Avenue  ',
      homeArrivalTime: '17:45',
      workAddress: '  200   Example Work Way  ',
      workArrivalTime: '08:45',
      cushionMinutes: 10,
    }

    expect(saveTrafficPreferences(preferences, storage)).toBe(true)
    expect(saveTrafficPreferences({
      ...preferences,
      homeAddress: '100 Example Avenue',
      workAddress: '200 Example Work Way',
    }, storage)).toBe(false)
    expect(storage.writes).toBe(1)
    expect(loadTrafficPreferences(storage)).toEqual({
      version: 2,
      homeAddress: '100 Example Avenue',
      homeArrivalTime: '17:45',
      workAddress: '200 Example Work Way',
      workArrivalTime: '08:45',
      cushionMinutes: 10,
    })

    const persisted = JSON.parse(
      storage.getItem(TRAFFIC_PREFERENCES_STORAGE_KEY) ?? '{}',
    ) as Record<string, unknown>
    expect(persisted).toEqual({
      version: 2,
      homeAddress: '100 Example Avenue',
      homeArrivalTime: '17:45',
      workAddress: '200 Example Work Way',
      workArrivalTime: '08:45',
      cushionMinutes: 10,
    })
    expect(persisted).not.toHaveProperty('origin')
    expect(persisted).not.toHaveProperty('route')
    expect(persisted).not.toHaveProperty('latitude')
    expect(persisted).not.toHaveProperty('leaveBy')
  })

  it('migrates the original Home-only schedule without losing its address or arrival time', () => {
    const storage = new CountingStorage()
    storage.setItem(TRAFFIC_PREFERENCES_STORAGE_KEY, JSON.stringify({
      version: 1,
      homeAddress: '100 Example Avenue',
      arrivalTime: '18:15',
      cushionMinutes: 10,
    }))

    expect(loadTrafficPreferences(storage)).toEqual({
      version: 2,
      homeAddress: '100 Example Avenue',
      homeArrivalTime: '18:15',
      workAddress: '',
      workArrivalTime: '09:00',
      cushionMinutes: 10,
    })
  })

  it.each([
    '{broken json',
    JSON.stringify({ version: 1 }),
    JSON.stringify({ ...DEFAULT_TRAFFIC_PREFERENCES, arrivalTime: '25:00' }),
    JSON.stringify({ ...DEFAULT_TRAFFIC_PREFERENCES, cushionMinutes: 20 }),
    JSON.stringify({ ...DEFAULT_TRAFFIC_PREFERENCES, homeAddress: 'x'.repeat(201) }),
    JSON.stringify({ ...DEFAULT_TRAFFIC_PREFERENCES, version: 2 }),
  ])('falls back safely for malformed or unknown records', (serialized) => {
    const storage = new CountingStorage()
    storage.setItem(TRAFFIC_PREFERENCES_STORAGE_KEY, serialized)

    expect(loadTrafficPreferences(storage)).toEqual(DEFAULT_TRAFFIC_PREFERENCES)
  })

  it('rejects invalid writes and handles blocked storage', () => {
    const storage = new CountingStorage()
    expect(saveTrafficPreferences({
      ...DEFAULT_TRAFFIC_PREFERENCES,
      cushionMinutes: 7 as 5,
    }, storage)).toBe(false)
    expect(storage.writes).toBe(0)

    expect(loadTrafficPreferences(new ThrowingStorage())).toEqual(DEFAULT_TRAFFIC_PREFERENCES)
    expect(saveTrafficPreferences(DEFAULT_TRAFFIC_PREFERENCES, new ThrowingStorage())).toBe(false)
  })

  it('clears saved preferences without disturbing unrelated storage', () => {
    const storage = new CountingStorage()
    storage.setItem('unrelated', 'keep')
    expect(clearTrafficPreferences(storage)).toBe(false)
    expect(saveTrafficPreferences(DEFAULT_TRAFFIC_PREFERENCES, storage)).toBe(true)
    expect(clearTrafficPreferences(storage)).toBe(true)
    expect(storage.getItem('unrelated')).toBe('keep')
    expect(loadTrafficPreferences(storage)).toEqual(DEFAULT_TRAFFIC_PREFERENCES)
    expect(clearTrafficPreferences(null)).toBe(false)
    expect(clearTrafficPreferences(new ThrowingStorage())).toBe(false)
  })
})

describe('today arrival time', () => {
  it('constructs a local Date on the same calendar day', () => {
    const now = new Date(2026, 7, 6, 9, 17, 42, 123)
    const arrival = getTodayArrival('18:05', now)

    expect(arrival.getFullYear()).toBe(2026)
    expect(arrival.getMonth()).toBe(7)
    expect(arrival.getDate()).toBe(6)
    expect(arrival.getHours()).toBe(18)
    expect(arrival.getMinutes()).toBe(5)
    expect(arrival.getSeconds()).toBe(0)
    expect(arrival.getMilliseconds()).toBe(0)
  })

  it.each(['', '9:30', '09:3', '24:00', '12:60'])('rejects invalid clock value %s', (value) => {
    expect(() => getTodayArrival(value, dateAt(8))).toThrowError(TrafficError)
  })
})

describe('day-aware commute selection', () => {
  const preferences: TrafficPreferences = {
    version: 2,
    homeAddress: 'Home',
    homeArrivalTime: '18:00',
    workAddress: 'Work',
    workArrivalTime: '09:00',
    cushionMinutes: 5,
  }

  it('plans tomorrow morning after an evening at home', () => {
    const drive = getPlannedTrafficDrive(preferences, new Date(2026, 7, 6, 19, 0))
    expect(drive).toMatchObject({
      dayLabel: 'Tomorrow',
      routeLabel: 'Home to Work',
      originAddress: 'Home',
      destinationAddress: 'Work',
    })
    expect(drive.desiredArrival).toEqual(new Date(2026, 7, 7, 9, 0))
  })

  it('switches to work-to-home after the morning commute and skips weekends', () => {
    expect(getPlannedTrafficDrive(preferences, new Date(2026, 7, 6, 12, 0))).toMatchObject({
      dayLabel: 'Today', routeLabel: 'Work to Home', originAddress: 'Work', destinationAddress: 'Home',
    })
    expect(getPlannedTrafficDrive(preferences, new Date(2026, 7, 8, 12, 0))).toMatchObject({
      dayLabel: 'Monday', routeLabel: 'Home to Work',
    })
  })
})

describe('Google traffic route solving', () => {
  it('sends the traffic-aware Routes request and converges in one request', async () => {
    const fetchMock = vi.fn<TrafficFetch>().mockResolvedValue(jsonResponse(makeRoutePayload()))
    const signal = new AbortController().signal

    const plan = await solveTrafficRoute(makeSolveOptions(fetchMock, { signal }))

    expect(plan).toEqual({
      leaveBy: dateAt(17, 25).toISOString(),
      requestedDepartureTime: dateAt(17, 25).toISOString(),
      desiredArrivalTime: dateAt(18).toISOString(),
      deadlineTime: dateAt(17, 55).toISOString(),
      predictedArrivalTime: dateAt(17, 55).toISOString(),
      durationSeconds: 1_800,
      staticDurationSeconds: 1_500,
      trafficDelaySeconds: 300,
      distanceMeters: 18_642,
      encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      startLocation: { latitude: 32.71, longitude: -117.16 },
      endLocation: { latitude: 32.82, longitude: -117.09 },
      fetchedAt: dateAt(12).toISOString(),
      iterations: 1,
      leaveNow: false,
      converged: true,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [requestUrl, requestInit] = fetchMock.mock.calls[0]
    expect(requestUrl).toBe(GOOGLE_ROUTES_ENDPOINT)
    expect(requestInit).toMatchObject({
      method: 'POST',
      referrerPolicy: 'origin',
      signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': 'test-browser-routes-key',
        'X-Goog-FieldMask': GOOGLE_ROUTES_FIELD_MASK,
      },
    })

    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>
    expect(body).toEqual({
      origin: { location: { latLng: { latitude: 32.71, longitude: -117.16 } } },
      destination: { address: 'Home destination' },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      trafficModel: 'BEST_GUESS',
      departureTime: dateAt(17, 25).toISOString(),
      computeAlternativeRoutes: false,
      polylineQuality: 'OVERVIEW',
      polylineEncoding: 'ENCODED_POLYLINE',
      units: 'IMPERIAL',
    })
    expect(body).not.toHaveProperty('arrivalTime')
  })

  it('supports a typed fallback origin and trims addresses before sending', async () => {
    const fetchMock = vi.fn<TrafficFetch>().mockResolvedValue(jsonResponse(makeRoutePayload()))

    await solveTrafficRoute(makeSolveOptions(fetchMock, {
      origin: { kind: 'address', address: '  Starting   point  ' },
      homeAddress: '  Home   destination  ',
    }))

    const requestInit = fetchMock.mock.calls[0][1]
    const body = JSON.parse(String(requestInit?.body)) as {
      origin: unknown
      destination: unknown
    }
    expect(body.origin).toEqual({ address: 'Starting point' })
    expect(body.destination).toEqual({ address: 'Home destination' })
  })

  it('uses the in-memory duration seed and follows traffic changes to convergence', async () => {
    const fetchMock = vi.fn<TrafficFetch>()
      .mockResolvedValueOnce(jsonResponse(makeRoutePayload(2_400, 2_000)))
      .mockResolvedValueOnce(jsonResponse(makeRoutePayload(2_100, 1_800)))
      .mockResolvedValueOnce(jsonResponse(makeRoutePayload(2_100, 1_800)))

    const plan = await solveTrafficRoute(makeSolveOptions(fetchMock, {
      seedDurationSeconds: 1_800,
    }))

    expect(plan.iterations).toBe(3)
    expect(plan.converged).toBe(true)
    expect(plan.leaveBy).toBe(dateAt(17, 20).toISOString())
    expect(fetchMock.mock.calls.map((call) => {
      const body = JSON.parse(String(call[1]?.body)) as { departureTime: string }
      return body.departureTime
    })).toEqual([
      dateAt(17, 25).toISOString(),
      dateAt(17, 15).toISOString(),
      dateAt(17, 20).toISOString(),
    ])
  })

  it('caps solving at four requests and takes the earlier final answer', async () => {
    const fetchMock = vi.fn<TrafficFetch>()
    ;[2_400, 2_250, 2_100, 1_950].forEach((duration) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(makeRoutePayload(duration)))
    })

    const plan = await solveTrafficRoute(makeSolveOptions(fetchMock))

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(plan).toMatchObject({
      iterations: 4,
      converged: false,
      leaveNow: false,
      leaveBy: dateAt(17, 20).toISOString(),
      requestedDepartureTime: dateAt(17, 20).toISOString(),
    })
  })

  it('detects an oscillating answer and chooses the earlier departure', async () => {
    const fetchMock = vi.fn<TrafficFetch>()
      .mockResolvedValueOnce(jsonResponse(makeRoutePayload(2_400)))
      .mockResolvedValueOnce(jsonResponse(makeRoutePayload(1_800)))

    const plan = await solveTrafficRoute(makeSolveOptions(fetchMock))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(plan).toMatchObject({
      iterations: 2,
      converged: false,
      leaveNow: false,
      leaveBy: dateAt(17, 15).toISOString(),
    })
  })

  it('requests a future route but recommends leaving now when the solution is in the past', async () => {
    const now = dateAt(17, 30)
    const fetchMock = vi.fn<TrafficFetch>().mockResolvedValue(
      jsonResponse(makeRoutePayload(2_400)),
    )

    const plan = await solveTrafficRoute(makeSolveOptions(fetchMock, { now }))

    expect(plan).toMatchObject({
      leaveBy: now.toISOString(),
      requestedDepartureTime: dateAt(17, 31).toISOString(),
      leaveNow: true,
      converged: true,
    })
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      departureTime: string
    }
    expect(new Date(requestBody.departureTime).getTime()).toBeGreaterThan(now.getTime())
  })

  it('validates inputs before making a paid request', async () => {
    const fetchMock = vi.fn<TrafficFetch>()

    await expect(solveTrafficRoute(makeSolveOptions(fetchMock, {
      homeAddress: ' ',
    }))).rejects.toMatchObject({ code: 'invalid-home' })
    await expect(solveTrafficRoute(makeSolveOptions(fetchMock, {
      origin: { kind: 'coordinates', latitude: 200, longitude: 0 },
    }))).rejects.toMatchObject({ code: 'invalid-origin' })
    await expect(solveTrafficRoute(makeSolveOptions(fetchMock, {
      apiKey: '',
    }))).rejects.toMatchObject({ code: 'configuration' })
    await expect(solveTrafficRoute(makeSolveOptions(fetchMock, {
      desiredArrival: dateAt(11),
    }))).rejects.toMatchObject({ code: 'past-arrival' })
    await expect(solveTrafficRoute(makeSolveOptions(fetchMock, {
      desiredArrival: new Date('invalid'),
    }))).rejects.toMatchObject({ code: 'invalid-arrival' })
    await expect(solveTrafficRoute(makeSolveOptions(fetchMock, {
      bufferMinutes: 7 as 5,
    }))).rejects.toMatchObject({ code: 'invalid-cushion' })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns safe service, network, no-route, and malformed-response errors', async () => {
    const fetchMock = vi.fn<TrafficFetch>()

    fetchMock.mockResolvedValueOnce(jsonResponse({ internal: 'details' }, 403))
    await expect(solveTrafficRoute(makeSolveOptions(fetchMock))).rejects.toMatchObject({
      code: 'service',
      message: expect.not.stringContaining('details'),
    })

    fetchMock.mockRejectedValueOnce(new TypeError('private network details'))
    await expect(solveTrafficRoute(makeSolveOptions(fetchMock))).rejects.toMatchObject({
      code: 'network',
      message: expect.not.stringContaining('private network details'),
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ routes: [] }))
    await expect(solveTrafficRoute(makeSolveOptions(fetchMock))).rejects.toMatchObject({
      code: 'no-route',
    })

    fetchMock.mockResolvedValueOnce(new Response('{not json', { status: 200 }))
    await expect(solveTrafficRoute(makeSolveOptions(fetchMock))).rejects.toMatchObject({
      code: 'invalid-response',
    })

    const malformedDuration = makeRoutePayload()
    malformedDuration.routes[0].duration = 'soon'
    fetchMock.mockResolvedValueOnce(jsonResponse(malformedDuration))
    await expect(solveTrafficRoute(makeSolveOptions(fetchMock))).rejects.toMatchObject({
      code: 'invalid-response',
    })
  })

  it('preserves abort errors so replaced calculations can stop quietly', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    const fetchMock = vi.fn<TrafficFetch>().mockRejectedValue(abortError)

    await expect(solveTrafficRoute(makeSolveOptions(fetchMock))).rejects.toBe(abortError)
  })
})

describe('styled Google Static Map URL', () => {
  const plan: Pick<TrafficPlan, 'encodedPolyline' | 'startLocation' | 'endLocation'> = {
    encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
    startLocation: { latitude: 32.71, longitude: -117.16 },
    endLocation: { latitude: 32.82, longitude: -117.09 },
  }

  it('builds a dark Chillax route map with its line, endpoint markers, and key', () => {
    const url = new URL(buildStaticMapUrl({
      plan,
      apiKey: 'test-static-map-key',
      theme: 'dark',
    }))

    expect(`${url.origin}${url.pathname}`).toBe(
      'https://maps.googleapis.com/maps/api/staticmap',
    )
    expect(url.searchParams.get('size')).toBe('640x400')
    expect(url.searchParams.get('scale')).toBe('2')
    expect(url.searchParams.get('key')).toBe('test-static-map-key')
    expect(url.searchParams.get('path')).toBe(
      'weight:6|color:0xb347d9ff|enc:_p~iF~ps|U_ulLnnqC_mqNvxq`@',
    )
    expect(url.searchParams.getAll('markers')).toEqual([
      'size:mid|color:0x7cdece|label:A|32.710000,-117.160000',
      'size:mid|color:0xb347d9|label:H|32.820000,-117.090000',
    ])
    expect(url.searchParams.getAll('style')).toContain(
      'feature:poi|visibility:off',
    )
  })

  it('supports a bounded light map and rejects unsafe configuration', () => {
    const lightUrl = new URL(buildStaticMapUrl({
      plan,
      apiKey: 'test-static-map-key',
      theme: 'light',
      width: 480,
      height: 300,
      scale: 1,
    }))
    expect(lightUrl.searchParams.get('size')).toBe('480x300')
    expect(lightUrl.searchParams.getAll('style')).toContain(
      'element:geometry|color:0xf5eff7',
    )

    expect(() => buildStaticMapUrl({ plan, apiKey: '' })).toThrowError(TrafficError)
    expect(() => buildStaticMapUrl({
      plan,
      apiKey: 'test-static-map-key',
      width: 641,
    })).toThrowError(TrafficError)
  })
})
