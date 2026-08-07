import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WeatherPage } from './WeatherPage'
import { WEATHER_PHOTO_PREFERENCES_STORAGE_KEY } from '../data/weatherPhotos'
import {
  DEFAULT_WEATHER_LOCATION,
  fetchWeatherForecast,
  loadWeatherPreferences,
  saveWeatherPreferences,
  searchWeatherLocation,
} from '../lib/weather'
import type {
  WeatherForecast,
  WeatherLocation,
  WeatherUnit,
} from '../lib/weather'

vi.mock('../lib/weather', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/weather')>()
  return {
    ...actual,
    fetchWeatherForecast: vi.fn(),
    loadWeatherPreferences: vi.fn(),
    saveWeatherPreferences: vi.fn(),
    searchWeatherLocation: vi.fn(),
  }
})

const fetchForecastMock = vi.mocked(fetchWeatherForecast)
const loadPreferencesMock = vi.mocked(loadWeatherPreferences)
const savePreferencesMock = vi.mocked(saveWeatherPreferences)
const searchLocationMock = vi.mocked(searchWeatherLocation)

const makeForecast = (
  location: WeatherLocation = { ...DEFAULT_WEATHER_LOCATION },
  unit: WeatherUnit = 'fahrenheit',
): WeatherForecast => ({
  location: { ...location },
  timezone: location.timezone,
  timezoneAbbreviation: 'PDT',
  unit,
  windUnit: unit === 'fahrenheit' ? 'mph' : 'kmh',
  precipitationUnit: unit === 'fahrenheit' ? 'inch' : 'mm',
  current: {
    time: '2026-08-06T14:30',
    temperature: unit === 'fahrenheit' ? 84 : 29,
    feelsLike: unit === 'fahrenheit' ? 87 : 31,
    humidity: 54,
    precipitation: 0,
    windSpeed: 7,
    windDirection: 270,
    windGust: 12,
    isDay: true,
    condition: { kind: 'clear', label: 'Clear skies' },
  },
  hourly: Array.from({ length: 24 }, (_, index) => ({
    time: `2026-08-06T${String(index).padStart(2, '0')}:00`,
    temperature: (unit === 'fahrenheit' ? 70 : 21) + index / 2,
    feelsLike: (unit === 'fahrenheit' ? 70 : 21) + index / 2,
    precipitationChance: index,
    windSpeed: 5 + index / 10,
    condition: index > 18 ? { kind: 'rain', label: 'Light rain' } : { kind: 'clear', label: 'Clear skies' },
  })),
  daily: Array.from({ length: 6 }, (_, index) => ({
    date: `2026-08-${String(index + 6).padStart(2, '0')}`,
    high: (unit === 'fahrenheit' ? 84 : 29) + index,
    low: (unit === 'fahrenheit' ? 67 : 19) + index,
    precipitationChance: index * 8,
    sunrise: `2026-08-${String(index + 6).padStart(2, '0')}T06:05`,
    sunset: `2026-08-${String(index + 6).padStart(2, '0')}T19:42`,
    maxWindSpeed: 10 + index,
    condition: index === 4
      ? { kind: 'rain', label: 'Light rain' }
      : { kind: 'clear', label: 'Clear skies' },
  })),
})

const makeProps = (overrides: Partial<Parameters<typeof WeatherPage>[0]> = {}) => ({
  isAudioBusy: false,
  onReturnToFocus: vi.fn(),
  onTogglePlayback: vi.fn(),
  playbackSessionName: 'focus session',
  presetName: 'Deep Work',
  sessionLabel: '60 minute session',
  timerDisplay: '42:15',
  timerStatus: 'running' as const,
  ...overrides,
})

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  loadPreferencesMock.mockReturnValue({
    version: 1,
    location: { ...DEFAULT_WEATHER_LOCATION },
    unit: 'fahrenheit',
    timeFormat: '12',
  })
  savePreferencesMock.mockReturnValue(true)
  fetchForecastMock.mockImplementation(async (location, unit) => makeForecast(location, unit))
  searchLocationMock.mockResolvedValue([])
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation')
})

describe('WeatherPage', () => {
  it('renders current, hourly, and five-day weather with the active Chillax session', async () => {
    render(<WeatherPage {...makeProps()} />)

    expect(screen.getByText('Looking outside...')).toBeInTheDocument()
    expect((await screen.findAllByText('Clear skies')).length).toBeGreaterThan(0)
    expect(screen.getByRole('searchbox', { name: 'Location' })).toHaveValue(
      'Tierrasanta, California',
    )
    expect(screen.getByLabelText('42:15 on the Chillax timer')).toBeInTheDocument()
    expect(screen.getByText('Deep Work')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause focus session' })).toBeInTheDocument()

    const hourly = screen.getByRole('region', { name: 'Next 24 hours' })
    const daily = screen.getByRole('region', { name: 'Next 5 days' })
    expect(within(hourly).getAllByRole('listitem')).toHaveLength(8)
    expect(within(daily).getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Use Fahrenheit' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Use 12-hour time' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('link', { name: 'Open-Meteo' })).toHaveAttribute(
      'href',
      'https://open-meteo.com/',
    )
    expect(screen.getByRole('link', { name: 'GeoNames' })).toHaveAttribute(
      'href',
      'https://www.geonames.org/',
    )
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/',
    )
    expect(screen.getByText(/Auto-refreshes every 4 hours/)).toBeInTheDocument()
    expect(savePreferencesMock).not.toHaveBeenCalled()
  })

  it('loads condition-aware photography, remembers a favorite, and keeps a gradient fallback', async () => {
    render(<WeatherPage {...makeProps()} />)
    await screen.findAllByText('Clear skies')

    const hero = document.querySelector('.weather-hero')
    const photo = hero?.querySelector<HTMLImageElement>('.weather-hero__photo')
    expect(hero).not.toBeNull()
    expect(photo?.getAttribute('src')).toMatch(/^\/weather-photos\/.+\.webp$/)
    expect(screen.getByRole('button', { name: 'Favorite this weather photo' })).toBeDisabled()

    fireEvent.load(photo!)
    expect(hero).toHaveClass('has-photo')
    expect(screen.getByRole('link', { name: 'Unsplash' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Favorite this weather photo' }))
    expect(screen.getByRole('button', {
      name: 'Remove this weather photo from favorites',
    })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(JSON.parse(
      window.localStorage.getItem(WEATHER_PHOTO_PREFERENCES_STORAGE_KEY) ?? '{}',
    ).favorites).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Hide weather photography' }))
    expect(screen.getByRole('button', { name: 'Show weather photography' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(hero).not.toHaveClass('has-photo')
    expect(hero?.querySelector('.weather-hero__photo')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show weather photography' }))
    expect(hero?.querySelector('.weather-hero__photo')).not.toBeNull()
  })

  it('falls back across local photo failures and retries when the browser reconnects', async () => {
    render(<WeatherPage {...makeProps()} />)
    await screen.findAllByText('Clear skies')

    const hero = document.querySelector('.weather-hero')
    const firstPhoto = hero?.querySelector<HTMLImageElement>('.weather-hero__photo')
    expect(firstPhoto).not.toBeNull()
    const firstSource = firstPhoto?.getAttribute('src')

    fireEvent.error(firstPhoto!)
    const fallbackPhoto = hero?.querySelector<HTMLImageElement>('.weather-hero__photo')
    expect(fallbackPhoto).not.toBeNull()
    expect(fallbackPhoto?.getAttribute('src')).not.toBe(firstSource)

    fireEvent.error(fallbackPhoto!)
    expect(hero?.querySelector('.weather-hero__photo')).toBeNull()
    expect(hero).not.toHaveClass('has-photo')

    fireEvent(window, new Event('online'))
    await waitFor(() => expect(hero?.querySelector('.weather-hero__photo')).not.toBeNull())
  })

  it('searches by city, saves the selection, and preserves weather after no-match errors', async () => {
    const london: WeatherLocation = {
      name: 'London',
      state: 'England',
      country: 'United Kingdom',
      countryCode: 'GB',
      latitude: 51.5072,
      longitude: -0.1276,
      timezone: 'Europe/London',
    }
    searchLocationMock.mockResolvedValueOnce([london]).mockResolvedValueOnce([])
    render(<WeatherPage {...makeProps()} />)
    await screen.findAllByText('Clear skies')

    const input = screen.getByRole('searchbox', { name: 'Location' })
    fireEvent.input(input, { target: { value: 'London' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => expect(searchLocationMock).toHaveBeenCalledWith(
      'London',
      expect.any(AbortSignal),
    ))
    await waitFor(() => expect(fetchForecastMock).toHaveBeenCalledWith(
      london,
      'fahrenheit',
      expect.any(AbortSignal),
    ))
    expect(input).toHaveValue('London, England, United Kingdom')
    expect(savePreferencesMock).toHaveBeenCalledWith({
      version: 1,
      location: london,
      unit: 'fahrenheit',
      timeFormat: '12',
    })

    fireEvent.input(input, { target: { value: 'Atlantis' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No weather location matched')
    expect(screen.getAllByText('Clear skies').length).toBeGreaterThan(0)
  })

  it('changes units and time format, persists preferences, and refreshes on demand', async () => {
    render(<WeatherPage {...makeProps()} />)
    await screen.findAllByText('Clear skies')
    fetchForecastMock.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Use Celsius' }))
    await waitFor(() => expect(fetchForecastMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Tierrasanta' }),
      'celsius',
      expect.any(AbortSignal),
    ))
    expect(screen.getByRole('button', { name: 'Use Celsius' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(savePreferencesMock).toHaveBeenLastCalledWith(expect.objectContaining({
      unit: 'celsius',
      timeFormat: '12',
    })))

    const requestsAfterUnitChange = fetchForecastMock.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Use 24-hour time' }))
    expect(screen.getByRole('button', { name: 'Use 24-hour time' })).toHaveAttribute('aria-pressed', 'true')
    expect(fetchForecastMock).toHaveBeenCalledTimes(requestsAfterUnitChange)
    await waitFor(() => expect(savePreferencesMock).toHaveBeenLastCalledWith(expect.objectContaining({
      unit: 'celsius',
      timeFormat: '24',
    })))

    fireEvent.click(screen.getByRole('button', { name: 'Refresh forecast' }))
    await waitFor(() => expect(fetchForecastMock.mock.calls.length).toBeGreaterThan(
      requestsAfterUnitChange,
    ))
  })

  it('uses browser coordinates without replacing the Chillax session', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({
      coords: {
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        latitude: 32.82,
        longitude: -117.1,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: Date.now(),
      toJSON: () => ({}),
    }))
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    })
    render(<WeatherPage {...makeProps()} />)
    await screen.findAllByText('Clear skies')
    savePreferencesMock.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))

    await waitFor(() => expect(fetchForecastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Current location',
        latitude: 32.82,
        longitude: -117.1,
      }),
      'fahrenheit',
      expect.any(AbortSignal),
    ))
    expect(screen.getByRole('searchbox', { name: 'Location' })).toHaveValue('Current location')
    expect(savePreferencesMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Use 24-hour time' }))
    await waitFor(() => expect(savePreferencesMock).toHaveBeenLastCalledWith({
      version: 1,
      location: expect.objectContaining({ name: 'Tierrasanta' }),
      unit: 'fahrenheit',
      timeFormat: '24',
    }))
    expect(savePreferencesMock.mock.calls.some(([preferences]) => (
      preferences.location.name === 'Current location'
    ))).toBe(false)
    expect(screen.getByLabelText('42:15 on the Chillax timer')).toBeInTheDocument()
  })

  it('persists the latest controls when a location search resolves later', async () => {
    const london: WeatherLocation = {
      name: 'London',
      state: 'England',
      country: 'United Kingdom',
      countryCode: 'GB',
      latitude: 51.5072,
      longitude: -0.1276,
      timezone: 'Europe/London',
    }
    const search = createDeferred<WeatherLocation[]>()
    searchLocationMock.mockReturnValueOnce(search.promise)
    render(<WeatherPage {...makeProps()} />)
    await screen.findAllByText('Clear skies')

    const input = screen.getByRole('searchbox', { name: 'Location' })
    fireEvent.input(input, { target: { value: 'London' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('button', { name: 'Searching...' })

    fireEvent.click(screen.getByRole('button', { name: 'Use Celsius' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use 24-hour time' }))
    search.resolve([london])

    await waitFor(() => expect(savePreferencesMock).toHaveBeenLastCalledWith({
      version: 1,
      location: london,
      unit: 'celsius',
      timeFormat: '24',
    }))
    await waitFor(() => expect(fetchForecastMock).toHaveBeenCalledWith(
      london,
      'celsius',
      expect.any(AbortSignal),
    ))
  })

  it('keeps stale temperatures labeled with their fetched unit when conversion fails', async () => {
    const celsiusForecast = createDeferred<WeatherForecast>()
    fetchForecastMock.mockImplementation((location, unit) => unit === 'celsius'
      ? celsiusForecast.promise
      : Promise.resolve(makeForecast(location, unit)))
    render(<WeatherPage {...makeProps()} />)
    await screen.findAllByText('Clear skies')

    fireEvent.click(screen.getByRole('button', { name: 'Use Celsius' }))
    await waitFor(() => expect(fetchForecastMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Tierrasanta' }),
      'celsius',
      expect.any(AbortSignal),
    ))

    const currentWeather = screen.getByRole('region', { name: 'Current weather' })
    expect(within(currentWeather).getByText('84°')).toBeInTheDocument()
    expect(within(currentWeather).getByText('F')).toBeInTheDocument()

    celsiusForecast.reject(new Error('Celsius forecast failed.'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Celsius forecast failed.')
    expect(within(currentWeather).getByText('84°')).toBeInTheDocument()
    expect(within(currentWeather).getByText('F')).toBeInTheDocument()
  })

  it('explains denied GPS access and supports a forecast retry', async () => {
    fetchForecastMock
      .mockRejectedValueOnce(new Error('The forecast is unavailable right now.'))
      .mockImplementation(async (location, unit) => makeForecast(location, unit))
    const getCurrentPosition = vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => {
      failure({ code: 1, message: 'Denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })
    })
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    })
    render(<WeatherPage {...makeProps()} />)

    expect(await screen.findByText('Forecast unavailable')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Location access was blocked')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect((await screen.findAllByText('Clear skies')).length).toBeGreaterThan(0)
  })

  it('exposes playback and focus-return actions without owning either state', async () => {
    const props = makeProps()
    render(<WeatherPage {...props} />)
    await screen.findAllByText('Clear skies')

    fireEvent.click(screen.getByRole('button', { name: 'Pause focus session' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to focus' }))

    expect(props.onTogglePlayback).toHaveBeenCalledTimes(1)
    expect(props.onReturnToFocus).toHaveBeenCalledTimes(1)
  })
})
