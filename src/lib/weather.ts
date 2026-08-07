export type WeatherUnit = 'fahrenheit' | 'celsius'
export type WeatherWindUnit = 'mph' | 'kmh'
export type WeatherPrecipitationUnit = 'inch' | 'mm'
export type TimeFormat = '12' | '24'

export type WeatherConditionKind =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm'

export interface WeatherCondition {
  kind: WeatherConditionKind
  label: string
}

export interface WeatherLocation {
  name: string
  state: string | null
  country: string
  countryCode: string
  latitude: number
  longitude: number
  timezone: string
}

export interface WeatherCurrentConditions {
  time: string
  temperature: number
  feelsLike: number
  humidity: number
  precipitation: number
  windSpeed: number
  windDirection: number
  windGust: number
  isDay: boolean
  condition: WeatherCondition
}

export interface WeatherHourlyForecast {
  time: string
  temperature: number
  feelsLike: number
  precipitationChance: number
  windSpeed: number
  condition: WeatherCondition
}

export interface WeatherDailyForecast {
  date: string
  high: number
  low: number
  precipitationChance: number
  sunrise: string
  sunset: string
  maxWindSpeed: number
  condition: WeatherCondition
}

export interface WeatherForecast {
  location: WeatherLocation
  timezone: string
  timezoneAbbreviation: string
  unit: WeatherUnit
  windUnit: WeatherWindUnit
  precipitationUnit: WeatherPrecipitationUnit
  current: WeatherCurrentConditions
  hourly: WeatherHourlyForecast[]
  daily: WeatherDailyForecast[]
}

export interface WeatherPreferences {
  version: 1
  location: WeatherLocation
  unit: WeatherUnit
  timeFormat: TimeFormat
}

export type WeatherErrorCode =
  | 'invalid-query'
  | 'invalid-location'
  | 'invalid-unit'
  | 'network'
  | 'service'
  | 'invalid-response'

export class WeatherError extends Error {
  readonly code: WeatherErrorCode

  constructor(code: WeatherErrorCode, message: string) {
    super(message)
    this.name = 'WeatherError'
    this.code = code
  }
}

export const DEFAULT_WEATHER_LOCATION: WeatherLocation = Object.freeze({
  name: 'Tierrasanta',
  state: 'California',
  country: 'United States',
  countryCode: 'US',
  latitude: 32.8201,
  longitude: -117.0986,
  timezone: 'America/Los_Angeles',
})

export const WEATHER_PREFERENCES_STORAGE_KEY = 'chillax:weather:v1'

export const DEFAULT_WEATHER_PREFERENCES: WeatherPreferences = Object.freeze({
  version: 1,
  location: DEFAULT_WEATHER_LOCATION,
  unit: 'fahrenheit',
  timeFormat: '12',
})

const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const MAX_LOCATION_QUERY_LENGTH = 100
const HOURLY_FORECAST_LENGTH = 24
const DAILY_FORECAST_LENGTH = 6

const LOCATION_QUERY_ERROR = 'Enter a city or place name.'
const LOCATION_NETWORK_ERROR =
  "We couldn't reach the location service. Check your connection and try again."
const LOCATION_SERVICE_ERROR =
  'The location service is unavailable right now. Please try again shortly.'
const LOCATION_RESPONSE_ERROR =
  'The location service returned an unexpected response. Please try again.'
const FORECAST_NETWORK_ERROR =
  "We couldn't reach the weather service. Check your connection and try again."
const FORECAST_SERVICE_ERROR =
  'The weather service is unavailable right now. Please try again shortly.'
const FORECAST_RESPONSE_ERROR =
  'The weather service returned incomplete data. Please try again.'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isBoundedNumber = (value: unknown, minimum: number, maximum: number): value is number =>
  isFiniteNumber(value) && value >= minimum && value <= maximum

const isNonEmptyString = (value: unknown, maximumLength = 200): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= maximumLength

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

const isIsoLocalDateTime = (value: unknown): value is string =>
  typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)

const isWeatherUnit = (value: unknown): value is WeatherUnit =>
  value === 'fahrenheit' || value === 'celsius'

const isTimeFormat = (value: unknown): value is TimeFormat =>
  value === '12' || value === '24'

const isAbortError = (error: unknown): boolean =>
  isObject(error) && error.name === 'AbortError'

const cloneLocation = (location: WeatherLocation): WeatherLocation => ({ ...location })

const isWeatherLocation = (value: unknown): value is WeatherLocation => {
  if (!isObject(value)
    || !isNonEmptyString(value.name, 100)
    || !(value.state === null || isNonEmptyString(value.state, 100))
    || !(value.country === '' || isNonEmptyString(value.country, 100))
    || typeof value.countryCode !== 'string'
    || !(value.countryCode === '' || /^[A-Za-z]{2}$/.test(value.countryCode))
    || ((value.country === '') !== (value.countryCode === ''))
    || !isBoundedNumber(value.latitude, -90, 90)
    || !isBoundedNumber(value.longitude, -180, 180)
    || !isNonEmptyString(value.timezone, 100)) {
    return false
  }

  return true
}

const isPersistableWeatherLocation = (value: unknown): value is WeatherLocation =>
  isWeatherLocation(value)
  && value.country !== ''
  && value.countryCode !== ''
  && value.name.trim().toLowerCase() !== 'current location'

const createDefaultPreferences = (): WeatherPreferences => ({
  version: 1,
  location: cloneLocation(DEFAULT_WEATHER_LOCATION),
  unit: DEFAULT_WEATHER_PREFERENCES.unit,
  timeFormat: DEFAULT_WEATHER_PREFERENCES.timeFormat,
})

const isWeatherPreferences = (value: unknown): value is WeatherPreferences =>
  isObject(value)
  && value.version === 1
  && isWeatherLocation(value.location)
  && isWeatherUnit(value.unit)
  && isTimeFormat(value.timeFormat)

const getBrowserStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const weatherConditions: Readonly<Record<number, WeatherCondition>> = {
  1: { kind: 'clear', label: 'Mostly clear' },
  2: { kind: 'partly-cloudy', label: 'Partly cloudy' },
  3: { kind: 'cloudy', label: 'Overcast' },
  45: { kind: 'fog', label: 'Fog' },
  48: { kind: 'fog', label: 'Freezing fog' },
  51: { kind: 'drizzle', label: 'Light drizzle' },
  53: { kind: 'drizzle', label: 'Drizzle' },
  55: { kind: 'drizzle', label: 'Heavy drizzle' },
  56: { kind: 'drizzle', label: 'Light freezing drizzle' },
  57: { kind: 'drizzle', label: 'Freezing drizzle' },
  61: { kind: 'rain', label: 'Light rain' },
  63: { kind: 'rain', label: 'Rain' },
  65: { kind: 'rain', label: 'Heavy rain' },
  66: { kind: 'rain', label: 'Light freezing rain' },
  67: { kind: 'rain', label: 'Freezing rain' },
  71: { kind: 'snow', label: 'Light snow' },
  73: { kind: 'snow', label: 'Snow' },
  75: { kind: 'snow', label: 'Heavy snow' },
  77: { kind: 'snow', label: 'Snow grains' },
  80: { kind: 'rain', label: 'Light rain showers' },
  81: { kind: 'rain', label: 'Rain showers' },
  82: { kind: 'rain', label: 'Heavy rain showers' },
  85: { kind: 'snow', label: 'Light snow showers' },
  86: { kind: 'snow', label: 'Heavy snow showers' },
  95: { kind: 'storm', label: 'Thunderstorm' },
  96: { kind: 'storm', label: 'Thunderstorm with light hail' },
  99: { kind: 'storm', label: 'Thunderstorm with hail' },
}

export function getWeatherCondition(code: number, isDay = true): WeatherCondition {
  if (code === 0) {
    return {
      kind: 'clear',
      label: isDay ? 'Clear skies' : 'Clear night',
    }
  }

  const condition = weatherConditions[code]
  return condition ? { ...condition } : { kind: 'cloudy', label: 'Unknown conditions' }
}

const normalizeLocationQuery = (query: string): string => {
  const normalized = typeof query === 'string' ? query.trim().replace(/\s+/g, ' ') : ''

  if (normalized.length < 2
    || normalized.length > MAX_LOCATION_QUERY_LENGTH
    || !/\p{L}/u.test(normalized)) {
    throw new WeatherError('invalid-query', LOCATION_QUERY_ERROR)
  }

  return normalized
}

const requestJson = async (
  url: URL,
  signal: AbortSignal | undefined,
  networkMessage: string,
  serviceMessage: string,
  responseMessage: string,
): Promise<unknown> => {
  let response: Response

  try {
    response = await globalThis.fetch(url, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new WeatherError('network', networkMessage)
  }

  if (!response.ok) {
    throw new WeatherError('service', serviceMessage)
  }

  try {
    const payload = await response.json() as unknown
    if (isObject(payload) && payload.error === true) {
      throw new WeatherError('service', serviceMessage)
    }
    return payload
  } catch (error) {
    if (error instanceof WeatherError) throw error
    throw new WeatherError('invalid-response', responseMessage)
  }
}

const parseLocation = (value: unknown): WeatherLocation | null => {
  if (!isObject(value)
    || !isNonEmptyString(value.name, 100)
    || !isBoundedNumber(value.latitude, -90, 90)
    || !isBoundedNumber(value.longitude, -180, 180)
    || !isNonEmptyString(value.timezone, 100)
    || typeof value.country_code !== 'string'
    || !/^[A-Za-z]{2}$/.test(value.country_code)) {
    return null
  }

  const state = isNonEmptyString(value.admin1, 100) ? value.admin1.trim() : null
  const countryCode = value.country_code.toUpperCase()
  const country = isNonEmptyString(value.country, 100)
    ? value.country.trim()
    : countryCode

  return {
    name: value.name.trim(),
    state,
    country,
    countryCode,
    latitude: value.latitude,
    longitude: value.longitude,
    timezone: value.timezone.trim(),
  }
}

export async function searchWeatherLocation(
  query: string,
  signal?: AbortSignal,
): Promise<WeatherLocation[]> {
  const normalizedQuery = normalizeLocationQuery(query)
  const url = new URL(GEOCODING_ENDPOINT)
  url.searchParams.set('name', normalizedQuery)
  url.searchParams.set('count', '10')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')

  const payload = await requestJson(
    url,
    signal,
    LOCATION_NETWORK_ERROR,
    LOCATION_SERVICE_ERROR,
    LOCATION_RESPONSE_ERROR,
  )

  if (!isObject(payload)) {
    throw new WeatherError('invalid-response', LOCATION_RESPONSE_ERROR)
  }

  if (payload.results === undefined) return []
  if (!Array.isArray(payload.results)) {
    throw new WeatherError('invalid-response', LOCATION_RESPONSE_ERROR)
  }

  const parsedLocations = payload.results
    .map(parseLocation)
    .filter((location): location is WeatherLocation => location !== null)

  if (payload.results.length > 0 && parsedLocations.length === 0) {
    throw new WeatherError('invalid-response', LOCATION_RESPONSE_ERROR)
  }

  return parsedLocations
}

const requireForecastLocation = (location: WeatherLocation) => {
  if (!isWeatherLocation(location)) {
    throw new WeatherError('invalid-location', 'Choose a valid location and try again.')
  }
}

const requireForecastUnit = (unit: WeatherUnit) => {
  if (!isWeatherUnit(unit)) {
    throw new WeatherError('invalid-unit', 'Choose Fahrenheit or Celsius and try again.')
  }
}

const getRequiredObject = (value: unknown): Record<string, unknown> => {
  if (!isObject(value)) {
    throw new WeatherError('invalid-response', FORECAST_RESPONSE_ERROR)
  }
  return value
}

const getRequiredArray = (value: unknown, minimumLength: number): unknown[] => {
  if (!Array.isArray(value) || value.length < minimumLength) {
    throw new WeatherError('invalid-response', FORECAST_RESPONSE_ERROR)
  }
  return value
}

const getRequiredNumber = (
  values: unknown[],
  index: number,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
): number => {
  const value = values[index]
  if (!isBoundedNumber(value, minimum, maximum)) {
    throw new WeatherError('invalid-response', FORECAST_RESPONSE_ERROR)
  }
  return value
}

const getRequiredWeatherCode = (values: unknown[], index: number): number => {
  const code = getRequiredNumber(values, index)
  if (!Number.isInteger(code)) {
    throw new WeatherError('invalid-response', FORECAST_RESPONSE_ERROR)
  }
  return code
}

const parseCurrentConditions = (value: unknown): WeatherCurrentConditions => {
  const current = getRequiredObject(value)

  if (!isIsoLocalDateTime(current.time)
    || !isFiniteNumber(current.temperature_2m)
    || !isFiniteNumber(current.apparent_temperature)
    || !isBoundedNumber(current.relative_humidity_2m, 0, 100)
    || !isBoundedNumber(current.precipitation, 0, Number.POSITIVE_INFINITY)
    || !isFiniteNumber(current.weather_code)
    || !Number.isInteger(current.weather_code)
    || (current.is_day !== 0 && current.is_day !== 1)
    || !isBoundedNumber(current.wind_speed_10m, 0, Number.POSITIVE_INFINITY)
    || !isBoundedNumber(current.wind_direction_10m, 0, 360)
    || !isBoundedNumber(current.wind_gusts_10m, 0, Number.POSITIVE_INFINITY)) {
    throw new WeatherError('invalid-response', FORECAST_RESPONSE_ERROR)
  }

  const isDay = current.is_day === 1
  return {
    time: current.time,
    temperature: current.temperature_2m,
    feelsLike: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    precipitation: current.precipitation,
    windSpeed: current.wind_speed_10m,
    windDirection: current.wind_direction_10m,
    windGust: current.wind_gusts_10m,
    isDay,
    condition: getWeatherCondition(current.weather_code, isDay),
  }
}

const parseHourlyForecast = (value: unknown): WeatherHourlyForecast[] => {
  const hourly = getRequiredObject(value)
  const times = getRequiredArray(hourly.time, HOURLY_FORECAST_LENGTH)
  const temperatures = getRequiredArray(hourly.temperature_2m, HOURLY_FORECAST_LENGTH)
  const feelsLike = getRequiredArray(hourly.apparent_temperature, HOURLY_FORECAST_LENGTH)
  const precipitationChances = getRequiredArray(
    hourly.precipitation_probability,
    HOURLY_FORECAST_LENGTH,
  )
  const weatherCodes = getRequiredArray(hourly.weather_code, HOURLY_FORECAST_LENGTH)
  const windSpeeds = getRequiredArray(hourly.wind_speed_10m, HOURLY_FORECAST_LENGTH)

  return Array.from({ length: HOURLY_FORECAST_LENGTH }, (_, index) => {
    const time = times[index]
    if (!isIsoLocalDateTime(time)) {
      throw new WeatherError('invalid-response', FORECAST_RESPONSE_ERROR)
    }

    const weatherCode = getRequiredWeatherCode(weatherCodes, index)
    return {
      time,
      temperature: getRequiredNumber(temperatures, index),
      feelsLike: getRequiredNumber(feelsLike, index),
      precipitationChance: getRequiredNumber(precipitationChances, index, 0, 100),
      windSpeed: getRequiredNumber(windSpeeds, index, 0),
      condition: getWeatherCondition(weatherCode),
    }
  })
}

const parseDailyForecast = (value: unknown): WeatherDailyForecast[] => {
  const daily = getRequiredObject(value)
  const dates = getRequiredArray(daily.time, DAILY_FORECAST_LENGTH)
  const weatherCodes = getRequiredArray(daily.weather_code, DAILY_FORECAST_LENGTH)
  const highs = getRequiredArray(daily.temperature_2m_max, DAILY_FORECAST_LENGTH)
  const lows = getRequiredArray(daily.temperature_2m_min, DAILY_FORECAST_LENGTH)
  const precipitationChances = getRequiredArray(
    daily.precipitation_probability_max,
    DAILY_FORECAST_LENGTH,
  )
  const sunrises = getRequiredArray(daily.sunrise, DAILY_FORECAST_LENGTH)
  const sunsets = getRequiredArray(daily.sunset, DAILY_FORECAST_LENGTH)
  const maxWindSpeeds = getRequiredArray(daily.wind_speed_10m_max, DAILY_FORECAST_LENGTH)

  return Array.from({ length: DAILY_FORECAST_LENGTH }, (_, index) => {
    const date = dates[index]
    const sunrise = sunrises[index]
    const sunset = sunsets[index]
    if (!isIsoDate(date) || !isIsoLocalDateTime(sunrise) || !isIsoLocalDateTime(sunset)) {
      throw new WeatherError('invalid-response', FORECAST_RESPONSE_ERROR)
    }

    const weatherCode = getRequiredWeatherCode(weatherCodes, index)
    return {
      date,
      high: getRequiredNumber(highs, index),
      low: getRequiredNumber(lows, index),
      precipitationChance: getRequiredNumber(precipitationChances, index, 0, 100),
      sunrise,
      sunset,
      maxWindSpeed: getRequiredNumber(maxWindSpeeds, index, 0),
      condition: getWeatherCondition(weatherCode),
    }
  })
}

const parseForecast = (
  payload: unknown,
  location: WeatherLocation,
  unit: WeatherUnit,
): WeatherForecast => {
  const response = getRequiredObject(payload)
  const timezone = isNonEmptyString(response.timezone, 100)
    ? response.timezone
    : location.timezone

  if (!isNonEmptyString(timezone, 100)) {
    throw new WeatherError('invalid-response', FORECAST_RESPONSE_ERROR)
  }

  return {
    location: cloneLocation(location),
    timezone,
    timezoneAbbreviation: isNonEmptyString(response.timezone_abbreviation, 20)
      ? response.timezone_abbreviation
      : '',
    unit,
    windUnit: unit === 'fahrenheit' ? 'mph' : 'kmh',
    precipitationUnit: unit === 'fahrenheit' ? 'inch' : 'mm',
    current: parseCurrentConditions(response.current),
    hourly: parseHourlyForecast(response.hourly),
    daily: parseDailyForecast(response.daily),
  }
}

export async function fetchWeatherForecast(
  location: WeatherLocation,
  unit: WeatherUnit,
  signal?: AbortSignal,
): Promise<WeatherForecast> {
  requireForecastLocation(location)
  requireForecastUnit(unit)

  const windUnit: WeatherWindUnit = unit === 'fahrenheit' ? 'mph' : 'kmh'
  const precipitationUnit: WeatherPrecipitationUnit = unit === 'fahrenheit' ? 'inch' : 'mm'
  const url = new URL(FORECAST_ENDPOINT)
  url.searchParams.set('latitude', String(location.latitude))
  url.searchParams.set('longitude', String(location.longitude))
  url.searchParams.set(
    'current',
    [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'precipitation',
      'weather_code',
      'is_day',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
    ].join(','),
  )
  url.searchParams.set(
    'hourly',
    [
      'temperature_2m',
      'apparent_temperature',
      'precipitation_probability',
      'weather_code',
      'wind_speed_10m',
    ].join(','),
  )
  url.searchParams.set(
    'daily',
    [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'sunrise',
      'sunset',
      'wind_speed_10m_max',
    ].join(','),
  )
  url.searchParams.set('temperature_unit', unit)
  url.searchParams.set('wind_speed_unit', windUnit)
  url.searchParams.set('precipitation_unit', precipitationUnit)
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_hours', String(HOURLY_FORECAST_LENGTH))
  url.searchParams.set('forecast_days', String(DAILY_FORECAST_LENGTH))

  const payload = await requestJson(
    url,
    signal,
    FORECAST_NETWORK_ERROR,
    FORECAST_SERVICE_ERROR,
    FORECAST_RESPONSE_ERROR,
  )

  return parseForecast(payload, location, unit)
}

export function loadWeatherPreferences(
  storage: Storage | null = getBrowserStorage(),
): WeatherPreferences {
  if (!storage) return createDefaultPreferences()

  try {
    const serialized = storage.getItem(WEATHER_PREFERENCES_STORAGE_KEY)
    if (!serialized) return createDefaultPreferences()

    const value = JSON.parse(serialized) as unknown
    if (!isWeatherPreferences(value)) return createDefaultPreferences()

    const preferences: WeatherPreferences = {
      version: 1,
      location: isPersistableWeatherLocation(value.location)
        ? cloneLocation(value.location)
        : cloneLocation(DEFAULT_WEATHER_LOCATION),
      unit: value.unit,
      timeFormat: value.timeFormat,
    }
    if (!isPersistableWeatherLocation(value.location)) {
      saveWeatherPreferences(preferences, storage)
    }
    return preferences
  } catch {
    return createDefaultPreferences()
  }
}

export function saveWeatherPreferences(
  preferences: WeatherPreferences,
  storage: Storage | null = getBrowserStorage(),
): boolean {
  if (!storage
    || !isWeatherPreferences(preferences)
    || !isPersistableWeatherLocation(preferences.location)) {
    return false
  }

  try {
    const serialized = JSON.stringify({
      version: 1,
      location: cloneLocation(preferences.location),
      unit: preferences.unit,
      timeFormat: preferences.timeFormat,
    } satisfies WeatherPreferences)

    if (storage.getItem(WEATHER_PREFERENCES_STORAGE_KEY) === serialized) return false
    storage.setItem(WEATHER_PREFERENCES_STORAGE_KEY, serialized)
    return true
  } catch {
    return false
  }
}

export function clearWeatherPreferences(
  storage: Storage | null = getBrowserStorage(),
): boolean {
  if (!storage) return false

  try {
    const hadPreferences = storage.getItem(WEATHER_PREFERENCES_STORAGE_KEY) !== null
    storage.removeItem(WEATHER_PREFERENCES_STORAGE_KEY)
    return hadPreferences
  } catch {
    return false
  }
}
