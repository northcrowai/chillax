import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_WEATHER_LOCATION,
  DEFAULT_WEATHER_PREFERENCES,
  WEATHER_PREFERENCES_STORAGE_KEY,
  WeatherError,
  clearWeatherPreferences,
  fetchWeatherForecast,
  getWeatherCondition,
  loadWeatherPreferences,
  saveWeatherPreferences,
  searchWeatherLocation,
} from './weather'
import type { WeatherPreferences } from './weather'

const jsonResponse = (payload: unknown, status = 200) => new Response(
  JSON.stringify(payload),
  {
    status,
    headers: { 'Content-Type': 'application/json' },
  },
)

const makeForecastPayload = () => ({
  latitude: 32.82,
  longitude: -117.1,
  timezone: 'America/Los_Angeles',
  timezone_abbreviation: 'PDT',
  current: {
    time: '2026-08-06T09:15',
    temperature_2m: 72.5,
    apparent_temperature: 73.2,
    relative_humidity_2m: 63,
    precipitation: 0,
    weather_code: 0,
    is_day: 0,
    wind_speed_10m: 6.4,
    wind_direction_10m: 252,
    wind_gusts_10m: 10.1,
  },
  hourly: {
    time: Array.from(
      { length: 24 },
      (_, hour) => `2026-08-06T${String(hour).padStart(2, '0')}:00`,
    ),
    temperature_2m: Array.from({ length: 24 }, (_, index) => 68 + index / 2),
    apparent_temperature: Array.from({ length: 24 }, (_, index) => 67 + index / 2),
    precipitation_probability: Array.from({ length: 24 }, (_, index) => index),
    weather_code: Array.from({ length: 24 }, () => 2),
    wind_speed_10m: Array.from({ length: 24 }, (_, index) => 4 + index / 10),
  },
  daily: {
    time: [
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
      '2026-08-10',
      '2026-08-11',
    ],
    weather_code: [1, 2, 3, 45, 61, 95],
    temperature_2m_max: [78, 79, 81, 80, 76, 75],
    temperature_2m_min: [64, 65, 66, 66, 63, 62],
    precipitation_probability_max: [2, 4, 8, 10, 55, 42],
    sunrise: Array.from(
      { length: 6 },
      (_, index) => `2026-08-${String(index + 6).padStart(2, '0')}T06:05`,
    ),
    sunset: Array.from(
      { length: 6 },
      (_, index) => `2026-08-${String(index + 6).padStart(2, '0')}T19:42`,
    ),
    wind_speed_10m_max: [9, 10, 8, 7, 12, 14],
  },
})

const makeGeocodingResult = (overrides: Record<string, unknown> = {}) => ({
  id: 5_392_160,
  name: 'San Diego',
  latitude: 32.7157,
  longitude: -117.1611,
  timezone: 'America/Los_Angeles',
  country_code: 'US',
  country: 'United States',
  admin1: 'California',
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

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('weather conditions', () => {
  it('maps clear conditions for daytime and nighttime', () => {
    expect(getWeatherCondition(0, true)).toEqual({ kind: 'clear', label: 'Clear skies' })
    expect(getWeatherCondition(0, false)).toEqual({ kind: 'clear', label: 'Clear night' })
  })

  it.each([
    [1, 'clear', 'Mostly clear'],
    [2, 'partly-cloudy', 'Partly cloudy'],
    [3, 'cloudy', 'Overcast'],
    [45, 'fog', 'Fog'],
    [48, 'fog', 'Freezing fog'],
    [51, 'drizzle', 'Light drizzle'],
    [57, 'drizzle', 'Freezing drizzle'],
    [61, 'rain', 'Light rain'],
    [67, 'rain', 'Freezing rain'],
    [71, 'snow', 'Light snow'],
    [77, 'snow', 'Snow grains'],
    [82, 'rain', 'Heavy rain showers'],
    [86, 'snow', 'Heavy snow showers'],
    [95, 'storm', 'Thunderstorm'],
    [99, 'storm', 'Thunderstorm with hail'],
  ] as const)('maps WMO code %i', (code, kind, label) => {
    expect(getWeatherCondition(code)).toEqual({ kind, label })
  })

  it('returns a safe fallback for unknown codes', () => {
    expect(getWeatherCondition(999)).toEqual({
      kind: 'cloudy',
      label: 'Unknown conditions',
    })
  })
})

describe('location search', () => {
  it('normalizes city and state searches and maps typed locations', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [makeGeocodingResult()] }))

    await expect(searchWeatherLocation('  San   Diego, CA  ')).resolves.toEqual([{
      name: 'San Diego',
      state: 'California',
      country: 'United States',
      countryCode: 'US',
      latitude: 32.7157,
      longitude: -117.1611,
      timezone: 'America/Los_Angeles',
    }])

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      'https://geocoding-api.open-meteo.com/v1/search',
    )
    expect(requestUrl.searchParams.get('name')).toBe('San Diego, CA')
    expect(requestUrl.searchParams.get('count')).toBe('10')
    expect(requestUrl.searchParams.get('language')).toBe('en')
    expect(requestUrl.searchParams.get('format')).toBe('json')
    expect(requestUrl.searchParams.has('countryCode')).toBe(false)
    expect(requestInit.headers).toEqual({ Accept: 'application/json' })
  })

  it('keeps special characters inside the encoded name parameter', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const query = "St. John's, NL & countryCode=XX"

    await expect(searchWeatherLocation(query)).resolves.toEqual([])

    const [requestUrl] = fetchMock.mock.calls[0] as [URL]
    expect(requestUrl.searchParams.get('name')).toBe(query)
    expect(requestUrl.searchParams.has('countryCode')).toBe(false)
  })

  it.each([
    '',
    ' ',
    'x',
    '---',
    '92124',
    'a'.repeat(101),
    null as unknown as string,
  ])('rejects an unsafe or incomplete query before fetching', async (query) => {
    await expect(searchWeatherLocation(query)).rejects.toMatchObject({
      name: 'WeatherError',
      code: 'invalid-query',
      message: 'Enter a city or place name.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('drops malformed entries when other usable results remain', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      results: [{ name: 'Missing coordinates' }, makeGeocodingResult({ admin1: '' })],
    }))

    await expect(searchWeatherLocation('San Diego')).resolves.toEqual([
      expect.objectContaining({ name: 'San Diego', state: null }),
    ])
  })

  it('rejects a malformed result set instead of trusting it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [{ name: 'Missing coordinates' }] }))

    await expect(searchWeatherLocation('San Diego')).rejects.toMatchObject({
      code: 'invalid-response',
      message: expect.stringContaining('unexpected response'),
    })
  })

  it('returns friendly service, response, and network errors', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reason: 'Internal details' }, 503))
    await expect(searchWeatherLocation('San Diego')).rejects.toMatchObject({
      code: 'service',
      message: expect.stringContaining('unavailable'),
    })

    fetchMock.mockResolvedValueOnce(new Response('{not json', { status: 200 }))
    await expect(searchWeatherLocation('San Diego')).rejects.toMatchObject({
      code: 'invalid-response',
      message: expect.stringContaining('unexpected response'),
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: true, reason: 'Internal details' }))
    await expect(searchWeatherLocation('San Diego')).rejects.toMatchObject({
      code: 'service',
      message: expect.not.stringContaining('Internal details'),
    })

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(searchWeatherLocation('San Diego')).rejects.toMatchObject({
      code: 'network',
      message: expect.stringContaining('connection'),
    })
  })

  it('preserves abort errors so stale searches can be cancelled quietly', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    fetchMock.mockRejectedValue(abortError)

    await expect(searchWeatherLocation('San Diego')).rejects.toBe(abortError)
  })
})

describe('weather forecasts', () => {
  it('requests and maps current, next-24-hour, and six-day imperial forecasts', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeForecastPayload()))
    const controller = new AbortController()

    const forecast = await fetchWeatherForecast(
      DEFAULT_WEATHER_LOCATION,
      'fahrenheit',
      controller.signal,
    )

    expect(forecast).toMatchObject({
      location: DEFAULT_WEATHER_LOCATION,
      timezone: 'America/Los_Angeles',
      timezoneAbbreviation: 'PDT',
      unit: 'fahrenheit',
      windUnit: 'mph',
      precipitationUnit: 'inch',
      current: {
        time: '2026-08-06T09:15',
        temperature: 72.5,
        feelsLike: 73.2,
        humidity: 63,
        precipitation: 0,
        windSpeed: 6.4,
        windDirection: 252,
        windGust: 10.1,
        isDay: false,
        condition: { kind: 'clear', label: 'Clear night' },
      },
    })
    expect(forecast.location).not.toBe(DEFAULT_WEATHER_LOCATION)
    expect(forecast.hourly).toHaveLength(24)
    expect(forecast.hourly[0]).toEqual({
      time: '2026-08-06T00:00',
      temperature: 68,
      feelsLike: 67,
      precipitationChance: 0,
      windSpeed: 4,
      condition: { kind: 'partly-cloudy', label: 'Partly cloudy' },
    })
    expect(forecast.daily).toHaveLength(6)
    expect(forecast.daily[5]).toEqual({
      date: '2026-08-11',
      high: 75,
      low: 62,
      precipitationChance: 42,
      sunrise: '2026-08-11T06:05',
      sunset: '2026-08-11T19:42',
      maxWindSpeed: 14,
      condition: { kind: 'storm', label: 'Thunderstorm' },
    })

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(requestUrl.origin + requestUrl.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(requestUrl.searchParams.get('latitude')).toBe('32.8201')
    expect(requestUrl.searchParams.get('longitude')).toBe('-117.0986')
    expect(requestUrl.searchParams.get('temperature_unit')).toBe('fahrenheit')
    expect(requestUrl.searchParams.get('wind_speed_unit')).toBe('mph')
    expect(requestUrl.searchParams.get('precipitation_unit')).toBe('inch')
    expect(requestUrl.searchParams.get('forecast_hours')).toBe('24')
    expect(requestUrl.searchParams.get('forecast_days')).toBe('6')
    expect(requestUrl.searchParams.get('timezone')).toBe('auto')
    expect(requestUrl.searchParams.get('current')).toContain('relative_humidity_2m')
    expect(requestUrl.searchParams.get('hourly')).toContain('precipitation_probability')
    expect(requestUrl.searchParams.get('daily')).toContain('sunrise')
    expect(requestInit.signal).toBe(controller.signal)
  })

  it('requests Celsius, km/h, and millimeter values together', async () => {
    const payload = makeForecastPayload()
    delete (payload as Partial<typeof payload>).timezone_abbreviation
    fetchMock.mockResolvedValue(jsonResponse(payload))

    const forecast = await fetchWeatherForecast(DEFAULT_WEATHER_LOCATION, 'celsius')

    expect(forecast).toMatchObject({
      unit: 'celsius',
      windUnit: 'kmh',
      precipitationUnit: 'mm',
      timezoneAbbreviation: '',
    })
    const [requestUrl] = fetchMock.mock.calls[0] as [URL]
    expect(requestUrl.searchParams.get('temperature_unit')).toBe('celsius')
    expect(requestUrl.searchParams.get('wind_speed_unit')).toBe('kmh')
    expect(requestUrl.searchParams.get('precipitation_unit')).toBe('mm')
  })

  it('falls back to the selected location timezone when the service omits it', async () => {
    const payload = makeForecastPayload()
    delete (payload as Partial<typeof payload>).timezone
    fetchMock.mockResolvedValue(jsonResponse(payload))

    await expect(fetchWeatherForecast(DEFAULT_WEATHER_LOCATION, 'fahrenheit')).resolves.toMatchObject({
      timezone: 'America/Los_Angeles',
    })
  })

  it('rejects invalid location and unit input before fetching', async () => {
    await expect(fetchWeatherForecast({
      ...DEFAULT_WEATHER_LOCATION,
      latitude: 200,
    }, 'fahrenheit')).rejects.toMatchObject({ code: 'invalid-location' })

    await expect(fetchWeatherForecast(
      DEFAULT_WEATHER_LOCATION,
      'kelvin' as unknown as 'celsius',
    )).rejects.toMatchObject({ code: 'invalid-unit' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects missing, short, or invalid forecast values defensively', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ current: {}, hourly: {}, daily: {} }))
    await expect(fetchWeatherForecast(DEFAULT_WEATHER_LOCATION, 'fahrenheit')).rejects.toBeInstanceOf(
      WeatherError,
    )

    const shortHourly = makeForecastPayload()
    shortHourly.hourly.time.pop()
    fetchMock.mockResolvedValueOnce(jsonResponse(shortHourly))
    await expect(fetchWeatherForecast(DEFAULT_WEATHER_LOCATION, 'fahrenheit')).rejects.toMatchObject({
      code: 'invalid-response',
      message: expect.stringContaining('incomplete data'),
    })

    const invalidDaily = makeForecastPayload()
    invalidDaily.daily.precipitation_probability_max[2] = 101
    fetchMock.mockResolvedValueOnce(jsonResponse(invalidDaily))
    await expect(fetchWeatherForecast(DEFAULT_WEATHER_LOCATION, 'fahrenheit')).rejects.toMatchObject({
      code: 'invalid-response',
    })

    const invalidCurrent = makeForecastPayload()
    invalidCurrent.current.weather_code = 1.5
    fetchMock.mockResolvedValueOnce(jsonResponse(invalidCurrent))
    await expect(fetchWeatherForecast(DEFAULT_WEATHER_LOCATION, 'fahrenheit')).rejects.toMatchObject({
      code: 'invalid-response',
    })
  })

  it('returns friendly service and network errors and preserves aborts', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500))
    await expect(fetchWeatherForecast(DEFAULT_WEATHER_LOCATION, 'fahrenheit')).rejects.toMatchObject({
      code: 'service',
      message: expect.stringContaining('unavailable'),
    })

    fetchMock.mockRejectedValueOnce(new Error('DNS details'))
    await expect(fetchWeatherForecast(DEFAULT_WEATHER_LOCATION, 'fahrenheit')).rejects.toMatchObject({
      code: 'network',
      message: expect.not.stringContaining('DNS details'),
    })

    const abortError = new DOMException('Aborted', 'AbortError')
    fetchMock.mockRejectedValueOnce(abortError)
    await expect(fetchWeatherForecast(DEFAULT_WEATHER_LOCATION, 'fahrenheit')).rejects.toBe(abortError)
  })
})

describe('weather preferences storage', () => {
  it('uses independent Tierrasanta defaults when storage is unavailable or empty', () => {
    expect(DEFAULT_WEATHER_LOCATION).toMatchObject({
      name: 'Tierrasanta',
      latitude: 32.8201,
      longitude: -117.0986,
    })

    const first = loadWeatherPreferences(null)
    first.location.name = 'Changed locally'
    const second = loadWeatherPreferences(new CountingStorage())

    expect(second).toEqual(DEFAULT_WEATHER_PREFERENCES)
    expect(second.location).not.toBe(DEFAULT_WEATHER_LOCATION)
    expect(saveWeatherPreferences(second, null)).toBe(false)
  })

  it('round-trips valid preferences and avoids duplicate writes', () => {
    const storage = new CountingStorage()
    const preferences: WeatherPreferences = {
      version: 1,
      location: {
        name: 'London',
        state: 'England',
        country: 'United Kingdom',
        countryCode: 'GB',
        latitude: 51.5072,
        longitude: -0.1276,
        timezone: 'Europe/London',
      },
      unit: 'celsius',
      timeFormat: '24',
    }

    expect(saveWeatherPreferences(preferences, storage)).toBe(true)
    expect(saveWeatherPreferences(preferences, storage)).toBe(false)
    expect(storage.writes).toBe(1)
    expect(loadWeatherPreferences(storage)).toEqual(preferences)
    expect(loadWeatherPreferences(storage).location).not.toBe(preferences.location)
  })

  it('rejects new GPS records and scrubs old coordinates while keeping display preferences', () => {
    const rejectedStorage = new CountingStorage()
    const preferences: WeatherPreferences = {
      version: 1,
      location: {
        name: 'Current location',
        state: null,
        country: '',
        countryCode: '',
        latitude: 32.82,
        longitude: -117.1,
        timezone: 'America/Los_Angeles',
      },
      unit: 'celsius',
      timeFormat: '24',
    }

    expect(saveWeatherPreferences(preferences, rejectedStorage)).toBe(false)
    expect(rejectedStorage.writes).toBe(0)

    const legacyStorage = new CountingStorage()
    legacyStorage.setItem(WEATHER_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
    expect(loadWeatherPreferences(legacyStorage)).toEqual({
      version: 1,
      location: DEFAULT_WEATHER_LOCATION,
      unit: 'celsius',
      timeFormat: '24',
    })
    expect(JSON.parse(legacyStorage.getItem(WEATHER_PREFERENCES_STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      location: DEFAULT_WEATHER_LOCATION,
      unit: 'celsius',
      timeFormat: '24',
    })
  })

  it.each([
    '{broken json',
    JSON.stringify({ version: 1 }),
    JSON.stringify({ ...DEFAULT_WEATHER_PREFERENCES, unit: 'kelvin' }),
    JSON.stringify({
      ...DEFAULT_WEATHER_PREFERENCES,
      location: { ...DEFAULT_WEATHER_LOCATION, longitude: 500 },
    }),
    JSON.stringify({ ...DEFAULT_WEATHER_PREFERENCES, timeFormat: '13' }),
  ])('falls back safely for invalid persisted data', (serialized) => {
    const storage = new CountingStorage()
    storage.setItem(WEATHER_PREFERENCES_STORAGE_KEY, serialized)

    expect(loadWeatherPreferences(storage)).toEqual(DEFAULT_WEATHER_PREFERENCES)
  })

  it('rejects invalid writes and handles blocked storage', () => {
    const storage = new CountingStorage()
    const invalid = {
      ...DEFAULT_WEATHER_PREFERENCES,
      location: { ...DEFAULT_WEATHER_LOCATION, countryCode: 'USA' },
    } as WeatherPreferences

    expect(saveWeatherPreferences(invalid, storage)).toBe(false)
    expect(storage.writes).toBe(0)
    expect(loadWeatherPreferences(new ThrowingStorage())).toEqual(DEFAULT_WEATHER_PREFERENCES)
    expect(saveWeatherPreferences(DEFAULT_WEATHER_PREFERENCES, new ThrowingStorage())).toBe(false)
  })

  it('clears saved weather preferences safely', () => {
    const storage = new CountingStorage()
    expect(clearWeatherPreferences(storage)).toBe(false)
    expect(saveWeatherPreferences(DEFAULT_WEATHER_PREFERENCES, storage)).toBe(true)
    expect(clearWeatherPreferences(storage)).toBe(true)
    expect(loadWeatherPreferences(storage)).toEqual(DEFAULT_WEATHER_PREFERENCES)
    expect(clearWeatherPreferences(null)).toBe(false)
    expect(clearWeatherPreferences(new ThrowingStorage())).toBe(false)
  })
})
