import type { JSX, Ref } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import {
  HeartIcon,
  LocationIcon,
  PauseIcon,
  PhotoIcon,
  PlayIcon,
  RefreshIcon,
} from './Icons'
import { WeatherIcon } from './WeatherIcon'
import {
  getWeatherPhotoKey,
  getWeatherPhotoPeriod,
  loadWeatherPhotoPreferences,
  saveWeatherPhotoPreferences,
  selectWeatherPhoto,
} from '../data/weatherPhotos'
import type { WeatherPhotoId } from '../data/weatherPhotos'
import {
  fetchWeatherForecast,
  loadWeatherPreferences,
  saveWeatherPreferences,
  searchWeatherLocation,
} from '../lib/weather'
import type {
  TimeFormat,
  WeatherCondition,
  WeatherDailyForecast,
  WeatherForecast,
  WeatherLocation,
  WeatherUnit,
} from '../lib/weather'
import type { TimerStatus } from '../types'

interface WeatherPageProps {
  headingRef?: Ref<HTMLHeadingElement>
  isAudioBusy: boolean
  onReturnToFocus: () => void
  onTogglePlayback: () => void
  playbackSessionName: string
  presetName: string
  sessionLabel: string
  timerDisplay: string
  timerStatus: TimerStatus
}

type LocationRequest = 'gps' | 'search' | null
type ForecastStatus = 'loading' | 'ready' | 'refreshing' | 'error'

const AUTO_REFRESH_MS = 4 * 60 * 60 * 1_000
const HOURLY_STEP = 3
const HOURLY_ITEMS = 8
const DAILY_ITEMS = 5

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback

const formatLocation = (location: WeatherLocation) => {
  const region = location.state && location.state !== location.name ? location.state : null
  const country = !location.countryCode || location.countryCode === 'US' ? null : location.country
  return [location.name, region, country].filter(Boolean).join(', ')
}

const formatForecastHour = (isoTime: string, timeFormat: TimeFormat) => {
  const hour = Number(isoTime.slice(11, 13))
  const minute = isoTime.slice(14, 16) || '00'
  if (!Number.isFinite(hour)) return isoTime
  if (timeFormat === '24') return `${String(hour).padStart(2, '0')}:${minute}`

  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}${minute === '00' ? '' : `:${minute}`} ${period}`
}

const formatForecastDay = (isoDate: string) => {
  const date = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(date.getTime())) return isoDate
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date)
}

const isForecastHourDaytime = (isoTime: string, daily: WeatherDailyForecast[]) => {
  const day = daily.find((item) => item.date === isoTime.slice(0, 10))
  return day ? isoTime >= day.sunrise && isoTime < day.sunset : true
}

const formatClock = (date: Date, timezone: string, timeFormat: TimeFormat) => {
  try {
    const contextParts = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      month: '2-digit',
      timeZone: timezone,
      year: 'numeric',
    }).formatToParts(date)
    const context = Object.fromEntries(contextParts.map((part) => [part.type, part.value]))
    return {
      date: new Intl.DateTimeFormat('en-US', {
        day: 'numeric',
        month: 'long',
        timeZone: timezone,
        weekday: 'long',
      }).format(date),
      time: new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: timeFormat === '12',
        minute: '2-digit',
        timeZone: timezone,
      }).format(date),
      dateKey: `${context.year}-${context.month}-${context.day}`,
      hour: Number(context.hour) % 24,
    }
  } catch {
    return {
      date: new Intl.DateTimeFormat('en-US', {
        day: 'numeric',
        month: 'long',
        weekday: 'long',
      }).format(date),
      time: new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: timeFormat === '12',
        minute: '2-digit',
      }).format(date),
      dateKey: [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-'),
      hour: date.getHours(),
    }
  }
}

const formatUpdatedTime = (date: Date, timezone: string, timeFormat: TimeFormat) => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: timeFormat === '12',
      minute: '2-digit',
      timeZone: timezone,
    }).format(date)
  } catch {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
}

const formatWindDirection = (degrees: number) => {
  if (!Number.isFinite(degrees)) return ''
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
  return points[Math.round(((degrees % 360) + 360) % 360 / 45) % points.length]
}

const getPlaybackAction = (status: TimerStatus, sessionName: string) => {
  if (status === 'running') return { label: `Pause ${sessionName}`, text: 'Pause' }
  if (status === 'paused') return { label: `Resume ${sessionName}`, text: 'Resume' }
  if (status === 'completed') return { label: `Start a new ${sessionName}`, text: 'Start again' }
  return { label: `Start ${sessionName}`, text: 'Begin' }
}

const getSessionStatus = (status: TimerStatus) => {
  if (status === 'running') return 'Playing'
  if (status === 'paused') return 'Paused'
  if (status === 'completed') return 'Complete'
  return 'Ready'
}

function useLocationClock(timezone: string, timeFormat: TimeFormat) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(interval)
  }, [])

  return formatClock(now, timezone, timeFormat)
}

function WeatherSummaryIcon({ condition, isDay }: {
  condition: WeatherCondition
  isDay: boolean
}) {
  return (
    <span class={`weather-icon weather-icon--${condition.kind}`}>
      <WeatherIcon kind={condition.kind} isDay={isDay} />
    </span>
  )
}

export function WeatherPage({
  headingRef,
  isAudioBusy,
  onReturnToFocus,
  onTogglePlayback,
  playbackSessionName,
  presetName,
  sessionLabel,
  timerDisplay,
  timerStatus,
}: WeatherPageProps) {
  const [initialPreferences] = useState(loadWeatherPreferences)
  const [initialPhotoPreferences] = useState(loadWeatherPhotoPreferences)
  const [location, setLocation] = useState(initialPreferences.location)
  const [rememberedLocation, setRememberedLocation] = useState(initialPreferences.location)
  const [unit, setUnit] = useState<WeatherUnit>(initialPreferences.unit)
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(initialPreferences.timeFormat)
  const [query, setQuery] = useState(() => formatLocation(initialPreferences.location))
  const [forecast, setForecast] = useState<WeatherForecast | null>(null)
  const [forecastStatus, setForecastStatus] = useState<ForecastStatus>('loading')
  const [locationRequest, setLocationRequest] = useState<LocationRequest>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [photoPreferences, setPhotoPreferences] = useState(initialPhotoPreferences)
  const [loadedPhotoId, setLoadedPhotoId] = useState<WeatherPhotoId | null>(null)
  const [failedPhotoIds, setFailedPhotoIds] = useState<WeatherPhotoId[]>([])
  const searchAbortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  const lastPersistedPreferencesRef = useRef(initialPreferences)
  const lastPersistedPhotoPreferencesRef = useRef(initialPhotoPreferences)

  const timezone = forecast?.timezone || location.timezone
  const clock = useLocationClock(timezone, timeFormat)
  const currentCondition = forecast?.current.condition
  const currentKind = currentCondition?.kind ?? 'partly-cloudy'
  const isDay = forecast?.current.isDay ?? true
  const photoPeriod = getWeatherPhotoPeriod(clock.hour)
  const photoKey = getWeatherPhotoKey(currentKind, photoPeriod)
  const weatherPhoto = forecast
    ? selectWeatherPhoto(
        currentKind,
        photoPeriod,
        clock.dateKey,
        photoPreferences.favorites[photoKey],
        failedPhotoIds,
      )
    : null
  const hasHeroPhoto = Boolean(forecast)
    && photoPreferences.enabled
    && loadedPhotoId === weatherPhoto?.id
  const isPhotoFavorite = weatherPhoto
    ? photoPreferences.favorites[photoKey] === weatherPhoto.id
    : false
  const temperatureUnit = (forecast?.unit ?? unit) === 'fahrenheit' ? 'F' : 'C'
  const playbackAction = getPlaybackAction(timerStatus, playbackSessionName)

  useEffect(() => () => {
    mountedRef.current = false
    searchAbortRef.current?.abort()
  }, [])

  useEffect(() => {
    const previous = lastPersistedPreferencesRef.current
    if (previous.location === rememberedLocation
      && previous.timeFormat === timeFormat
      && previous.unit === unit) {
      return
    }

    const nextPreferences = {
      version: 1 as const,
      location: rememberedLocation,
      timeFormat,
      unit,
    }
    lastPersistedPreferencesRef.current = nextPreferences
    saveWeatherPreferences(nextPreferences)
  }, [rememberedLocation, timeFormat, unit])

  useEffect(() => {
    if (lastPersistedPhotoPreferencesRef.current === photoPreferences) return
    lastPersistedPhotoPreferencesRef.current = photoPreferences
    saveWeatherPhotoPreferences(photoPreferences)
  }, [photoPreferences])

  useEffect(() => {
    const retryPhotos = () => setFailedPhotoIds([])
    window.addEventListener('online', retryPhotos)
    return () => window.removeEventListener('online', retryPhotos)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setForecastStatus((current) => current === 'ready' || current === 'refreshing'
      ? 'refreshing'
      : 'loading')
    setMessage(null)

    void fetchWeatherForecast(location, unit, controller.signal)
      .then((nextForecast) => {
        if (!mountedRef.current || controller.signal.aborted) return
        setForecast(nextForecast)
        setLastUpdated(new Date())
        setForecastStatus('ready')
      })
      .catch((error: unknown) => {
        if (!mountedRef.current || controller.signal.aborted) return
        setForecastStatus('error')
        setMessage(getErrorMessage(error, 'The forecast is unavailable right now. Try again shortly.'))
      })

    return () => controller.abort()
  }, [location, refreshVersion, unit])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshVersion((current) => current + 1)
    }, AUTO_REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [])

  const selectLocation = useCallback((
    nextLocation: WeatherLocation,
    nextQuery: string,
    remember = true,
  ) => {
    setLocation(nextLocation)
    if (remember) setRememberedLocation(nextLocation)
    setQuery(nextQuery)
    setRefreshVersion((current) => current + 1)
    setMessage(null)
  }, [])

  const handleSearch = useCallback(async (event: JSX.TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedQuery = query.trim()
    if (trimmedQuery.length < 2) {
      setMessage('Enter a city or place name.')
      return
    }

    searchAbortRef.current?.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller
    setLocationRequest('search')
    setMessage(null)

    try {
      const matches = await searchWeatherLocation(trimmedQuery, controller.signal)
      if (controller.signal.aborted) return
      const nextLocation = matches[0]
      if (!nextLocation) {
        setMessage(`No weather location matched "${trimmedQuery}". Try a nearby city or place.`)
        return
      }
      selectLocation(nextLocation, formatLocation(nextLocation))
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessage(getErrorMessage(error, 'Location search failed. Try again.'))
      }
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null
        if (mountedRef.current) setLocationRequest(null)
      }
    }
  }, [query, selectLocation])

  const handleUseLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setMessage('This browser does not provide location access. Search for a city or place instead.')
      return
    }

    setLocationRequest('gps')
    setMessage(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mountedRef.current) return
        const nextLocation: WeatherLocation = {
          country: '',
          countryCode: '',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          name: 'Current location',
          state: null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        }
        selectLocation(nextLocation, 'Current location', false)
        setLocationRequest(null)
      },
      (error) => {
        if (!mountedRef.current) return
        const gpsMessage = error.code === 1
          ? 'Location access was blocked. Search for a city or place instead.'
          : error.code === 3
            ? 'Location lookup timed out. Try again or search by city.'
            : 'Your location could not be determined. Search for a city or place instead.'
        setMessage(gpsMessage)
        setLocationRequest(null)
      },
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1_000, timeout: 8_000 },
    )
  }, [selectLocation])

  const handleUnitChange = useCallback((nextUnit: WeatherUnit) => {
    if (nextUnit === unit) return
    setUnit(nextUnit)
    setMessage(null)
  }, [unit])

  const handleTimeFormatChange = useCallback((nextFormat: TimeFormat) => {
    if (nextFormat === timeFormat) return
    setTimeFormat(nextFormat)
  }, [timeFormat])

  const handleRefresh = useCallback(() => {
    setFailedPhotoIds([])
    setRefreshVersion((current) => current + 1)
  }, [])

  const handlePhotoToggle = useCallback(() => {
    setLoadedPhotoId(null)
    setFailedPhotoIds([])
    setPhotoPreferences((current) => ({
      ...current,
      enabled: !current.enabled,
    }))
  }, [])

  const handlePhotoFavorite = useCallback(() => {
    if (!weatherPhoto) return
    setPhotoPreferences((current) => {
      const favorites = { ...current.favorites }
      if (favorites[photoKey] === weatherPhoto.id) {
        delete favorites[photoKey]
      } else {
        favorites[photoKey] = weatherPhoto.id
      }
      return { ...current, favorites }
    })
  }, [photoKey, weatherPhoto])

  const handlePhotoError = useCallback((photoId: WeatherPhotoId) => {
    setLoadedPhotoId(null)
    setFailedPhotoIds((current) => current.includes(photoId)
      ? current
      : [...current, photoId])
  }, [])

  const hourlyForecast = forecast?.hourly
    .filter((_, index) => index % HOURLY_STEP === 0)
    .slice(0, HOURLY_ITEMS) ?? []
  const dailyForecast = forecast?.daily.slice(1, DAILY_ITEMS + 1) ?? []
  const today = forecast?.daily[0]

  return (
    <main class="app-main weather-main">
      <section
        class={`weather-hero weather-hero--${currentKind}${isDay ? '' : ' is-night'}${hasHeroPhoto ? ' has-photo' : ''}`}
        aria-labelledby="weather-page-title"
      >
        {forecast && photoPreferences.enabled && weatherPhoto ? (
          <img
            alt=""
            aria-hidden="true"
            class="weather-hero__photo"
            decoding="async"
            key={weatherPhoto.id}
            loading="eager"
            onError={() => handlePhotoError(weatherPhoto.id)}
            onLoad={() => setLoadedPhotoId(weatherPhoto.id)}
            src={weatherPhoto.src}
          />
        ) : null}
        <div class="weather-hero__photo-scrim" aria-hidden="true" />

        <div class="weather-toolbar">
          <form class="weather-search" onSubmit={handleSearch}>
            <label htmlFor="weather-location">Location</label>
            <div class="weather-search__controls">
              <input
                id="weather-location"
                name="location"
                onInput={(event) => setQuery(event.currentTarget.value)}
                placeholder="City or place"
                type="search"
                value={query}
              />
              <button disabled={locationRequest !== null} type="submit">
                {locationRequest === 'search' ? 'Searching...' : 'Search'}
              </button>
            </div>
          </form>

          <button
            class="weather-tool-button"
            disabled={locationRequest !== null}
            onClick={handleUseLocation}
            type="button"
          >
            <LocationIcon />
            <span>{locationRequest === 'gps' ? 'Locating...' : 'Use my location'}</span>
          </button>

          <div class="weather-preferences">
            <fieldset class="weather-segmented-control" aria-label="Temperature units">
              <button
                aria-label="Use Fahrenheit"
                aria-pressed={unit === 'fahrenheit'}
                onClick={() => handleUnitChange('fahrenheit')}
                type="button"
              >
                °F
              </button>
              <button
                aria-label="Use Celsius"
                aria-pressed={unit === 'celsius'}
                onClick={() => handleUnitChange('celsius')}
                type="button"
              >
                °C
              </button>
            </fieldset>
            <fieldset class="weather-segmented-control" aria-label="Time format">
              <button
                aria-label="Use 12-hour time"
                aria-pressed={timeFormat === '12'}
                onClick={() => handleTimeFormatChange('12')}
                type="button"
              >
                12h
              </button>
              <button
                aria-label="Use 24-hour time"
                aria-pressed={timeFormat === '24'}
                onClick={() => handleTimeFormatChange('24')}
                type="button"
              >
                24h
              </button>
            </fieldset>
            <button
              aria-label={photoPreferences.enabled
                ? 'Hide weather photography'
                : 'Show weather photography'}
              aria-pressed={photoPreferences.enabled}
              class="weather-photo-toggle"
              onClick={handlePhotoToggle}
              type="button"
            >
              <PhotoIcon />
              <span>Photos</span>
            </button>
            <button
              aria-label={isPhotoFavorite
                ? 'Remove this weather photo from favorites'
                : 'Favorite this weather photo'}
              aria-pressed={isPhotoFavorite}
              class="weather-photo-favorite"
              disabled={!hasHeroPhoto}
              onClick={handlePhotoFavorite}
              title={isPhotoFavorite ? 'Remove favorite' : 'Favorite this photo'}
              type="button"
            >
              <HeartIcon filled={isPhotoFavorite} />
            </button>
            <button
              aria-label="Refresh forecast"
              class="weather-refresh-button"
              disabled={forecastStatus === 'loading' || forecastStatus === 'refreshing'}
              onClick={handleRefresh}
              type="button"
            >
              <RefreshIcon />
            </button>
          </div>
        </div>

        <div class="weather-hero__content">
          <div class="weather-clock">
            <span class="eyebrow">Weather</span>
            <h1
              aria-label={`Weather in ${formatLocation(forecast?.location ?? location)}`}
              id="weather-page-title"
              ref={headingRef}
              tabIndex={-1}
            >
              {clock.time}
            </h1>
            <p>{clock.date}</p>
            <strong>{formatLocation(forecast?.location ?? location)}</strong>
            {hasHeroPhoto && weatherPhoto ? (
              <p class="weather-photo-credit">
                Photo by{' '}
                <a href={weatherPhoto.authorUrl} rel="noreferrer" target="_blank">
                  {weatherPhoto.author}
                </a>
                {' '}on{' '}
                <a href={weatherPhoto.sourceUrl} rel="noreferrer" target="_blank">
                  Unsplash
                </a>
              </p>
            ) : null}
          </div>

          <aside class="weather-session" aria-label="Current Chillax session">
            <div class="weather-session__topline">
              <span>Your Chillax session</span>
              <span class={`play-state${timerStatus === 'running' ? ' is-active' : ''}`}>
                <i aria-hidden="true" />
                {getSessionStatus(timerStatus)}
              </span>
            </div>
            <div class="weather-session__body">
              <div>
                <strong>{presetName}</strong>
                <span>{sessionLabel}</span>
              </div>
              <output aria-label={`${timerDisplay} on the Chillax timer`}>{timerDisplay}</output>
            </div>
            <div class="weather-session__actions">
              <button
                aria-label={playbackAction.label}
                class="weather-session__playback"
                disabled={isAudioBusy}
                onClick={onTogglePlayback}
                type="button"
              >
                {timerStatus === 'running' ? <PauseIcon /> : <PlayIcon />}
                <span>{isAudioBusy ? 'Preparing...' : playbackAction.text}</span>
              </button>
              <button class="weather-session__return" onClick={onReturnToFocus} type="button">
                Back to focus
              </button>
            </div>
          </aside>
        </div>
      </section>

      <section class="weather-card weather-current" aria-labelledby="current-weather-heading">
        <h2 class="sr-only" id="current-weather-heading">Current weather</h2>
        {forecast && currentCondition ? (
          <>
            <div class="weather-current__temperature">
              <strong>{Math.round(forecast.current.temperature)}°</strong>
              <span>{temperatureUnit}</span>
            </div>
            <WeatherSummaryIcon condition={currentCondition} isDay={forecast.current.isDay} />
            <div class="weather-current__condition">
              <strong>{currentCondition.label}</strong>
              <span>H {Math.round(today?.high ?? forecast.current.temperature)}° / L {Math.round(today?.low ?? forecast.current.temperature)}°</span>
            </div>
            <dl class="weather-current__details">
              <div>
                <dt>Feels like</dt>
                <dd>{Math.round(forecast.current.feelsLike)}°</dd>
              </div>
              <div>
                <dt>Wind</dt>
                <dd>{formatWindDirection(forecast.current.windDirection)} {Math.round(forecast.current.windSpeed)} {forecast.windUnit === 'kmh' ? 'km/h' : 'mph'}</dd>
              </div>
              <div>
                <dt>Humidity</dt>
                <dd>{Math.round(forecast.current.humidity)}%</dd>
              </div>
            </dl>
          </>
        ) : forecastStatus === 'error' ? (
          <div class="weather-loading weather-loading--error" role="alert">
            <div>
              <strong>Forecast unavailable</strong>
              <p>{message ?? 'The weather service could not be reached.'}</p>
            </div>
            <button onClick={handleRefresh} type="button">
              <RefreshIcon />
              <span>Try again</span>
            </button>
          </div>
        ) : (
          <div class="weather-loading" role="status">
            <span class="weather-loading__orb" aria-hidden="true" />
            <div>
              <strong>Looking outside...</strong>
              <p>Chillax is gathering the latest forecast.</p>
            </div>
          </div>
        )}
      </section>

      {forecast ? (
        <>
          <section class="weather-card weather-forecast" aria-labelledby="hourly-weather-heading">
            <div class="weather-card__header">
              <div>
                <span class="eyebrow">Coming up</span>
                <h2 id="hourly-weather-heading">Next 24 hours</h2>
              </div>
              <span>Every 3 hours</span>
            </div>
            <div class="hourly-forecast" role="list">
              {hourlyForecast.map((hour) => (
                <article class="hourly-forecast__item" key={hour.time} role="listitem">
                  <time dateTime={hour.time}>{formatForecastHour(hour.time, timeFormat)}</time>
                  <WeatherSummaryIcon
                    condition={hour.condition}
                    isDay={isForecastHourDaytime(hour.time, forecast.daily)}
                  />
                  <strong>{Math.round(hour.temperature)}°</strong>
                  <span>{Math.round(hour.precipitationChance)}% rain</span>
                </article>
              ))}
            </div>
          </section>

          <section class="weather-card weather-forecast" aria-labelledby="daily-weather-heading">
            <div class="weather-card__header">
              <div>
                <span class="eyebrow">Plan ahead</span>
                <h2 id="daily-weather-heading">Next 5 days</h2>
              </div>
              <span>High / low</span>
            </div>
            <div class="daily-forecast" role="list">
              {dailyForecast.map((day) => (
                <article class="daily-forecast__item" key={day.date} role="listitem">
                  <time dateTime={day.date}>{formatForecastDay(day.date)}</time>
                  <WeatherSummaryIcon condition={day.condition} isDay />
                  <div>
                    <strong>{Math.round(day.high)}°</strong>
                    <span>{Math.round(day.low)}°</span>
                  </div>
                  <p>{day.condition.label}</p>
                  <small>{Math.round(day.precipitationChance)}% rain</small>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <div class="weather-status-row">
        <div>
          {message && forecast ? <p class="weather-message" role="alert">{message}</p> : null}
          {!message && forecastStatus === 'refreshing'
            ? <p role="status">Updating the forecast...</p>
            : null}
          {!message && lastUpdated ? (
            <p>Updated {formatUpdatedTime(lastUpdated, timezone, timeFormat)} · Auto-refreshes every 4 hours</p>
          ) : null}
        </div>
        <p class="weather-attribution">
          Forecast data adapted from{' '}
          <a href="https://open-meteo.com/" rel="noreferrer" target="_blank">Open-Meteo</a>
          {' '}· Location data via{' '}
          <a href="https://www.geonames.org/" rel="noreferrer" target="_blank">GeoNames</a>
          {' '}·{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            rel="noreferrer"
            target="_blank"
          >
            CC BY 4.0
          </a>
        </p>
      </div>
    </main>
  )
}
