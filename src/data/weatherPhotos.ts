import type { WeatherConditionKind } from '../lib/weather'
import { assetPath } from '../lib/assets'

export type WeatherPhotoPeriod = 'morning' | 'afternoon' | 'evening' | 'night'

export type WeatherPhotoId =
  | 'clear-day'
  | 'clouds'
  | 'rain'
  | 'snow'
  | 'storm'
  | 'fog'
  | 'clear-night'
  | 'golden-hour'

export interface WeatherPhoto {
  author: string
  authorUrl: string
  description: string
  id: WeatherPhotoId
  sourceUrl: string
  src: string
}

export interface WeatherPhotoPreferences {
  enabled: boolean
  favorites: Record<string, WeatherPhotoId>
  version: 1
}

export const WEATHER_PHOTO_PREFERENCES_STORAGE_KEY = 'chillax:weather:photos:v1'

const WEATHER_PHOTOS: Readonly<Record<WeatherPhotoId, WeatherPhoto>> = {
  'clear-day': {
    author: 'Francesco Ungaro',
    authorUrl: 'https://unsplash.com/@francesco_ungaro',
    description: 'Sunlight over an open green field',
    id: 'clear-day',
    sourceUrl: 'https://unsplash.com/photos/7FcZfpFZ7sM',
    src: assetPath('/weather-photos/clear-day.webp'),
  },
  clouds: {
    author: 'Kenrick Mills',
    authorUrl: 'https://unsplash.com/@kenrickmills',
    description: 'Dramatic clouds at noon',
    id: 'clouds',
    sourceUrl: 'https://unsplash.com/photos/eCBGt3ashQU',
    src: assetPath('/weather-photos/clouds.webp'),
  },
  rain: {
    author: 'masahiro miyagi',
    authorUrl: 'https://unsplash.com/@masamasa3',
    description: 'A rain-soaked city street at night',
    id: 'rain',
    sourceUrl: 'https://unsplash.com/photos/DxrV_lky_Sc',
    src: assetPath('/weather-photos/rain.webp'),
  },
  snow: {
    author: 'Shutter Speed',
    authorUrl: 'https://unsplash.com/@shutter_speed_',
    description: 'Snow-covered mountains under a blue sky',
    id: 'snow',
    sourceUrl: 'https://unsplash.com/photos/WbCYPK2JmWA',
    src: assetPath('/weather-photos/snow.webp'),
  },
  storm: {
    author: 'Drew Stock',
    authorUrl: 'https://unsplash.com/@drewbian',
    description: 'Lightning breaking through storm clouds',
    id: 'storm',
    sourceUrl: 'https://unsplash.com/photos/r-ulEMCm4fQ',
    src: assetPath('/weather-photos/storm.webp'),
  },
  fog: {
    author: 'Timon Reinhard',
    authorUrl: 'https://unsplash.com/@timonreinhard',
    description: 'A quiet woodland softened by fog',
    id: 'fog',
    sourceUrl: 'https://unsplash.com/photos/82Vi8BBRXl4',
    src: assetPath('/weather-photos/fog.webp'),
  },
  'clear-night': {
    author: 'Casey Horner',
    authorUrl: 'https://unsplash.com/@mischievous_penguins',
    description: 'A star-filled night sky',
    id: 'clear-night',
    sourceUrl: 'https://unsplash.com/photos/WGdZyGkfcBQ',
    src: assetPath('/weather-photos/clear-night.webp'),
  },
  'golden-hour': {
    author: 'Harsha Kulkarni',
    authorUrl: 'https://unsplash.com/@clickoffbeat_144',
    description: 'Golden-hour light over a grassy field',
    id: 'golden-hour',
    sourceUrl: 'https://unsplash.com/photos/9jEx5fUCMUY',
    src: assetPath('/weather-photos/golden-hour.webp'),
  },
}

const periods = (
  morning: readonly WeatherPhotoId[],
  afternoon: readonly WeatherPhotoId[],
  evening: readonly WeatherPhotoId[],
  night: readonly WeatherPhotoId[],
) => ({ afternoon, evening, morning, night })

const WEATHER_PHOTO_CANDIDATES: Readonly<
  Record<WeatherConditionKind, Readonly<Record<WeatherPhotoPeriod, readonly WeatherPhotoId[]>>>
> = {
  clear: periods(
    ['clear-day', 'golden-hour'],
    ['clear-day', 'clouds'],
    ['golden-hour', 'clear-day'],
    ['clear-night', 'clouds'],
  ),
  'partly-cloudy': periods(
    ['clouds', 'clear-day', 'fog'],
    ['clouds', 'clear-day'],
    ['golden-hour', 'clouds'],
    ['clear-night', 'clouds'],
  ),
  cloudy: periods(
    ['clouds', 'fog'],
    ['clouds', 'fog'],
    ['clouds', 'golden-hour'],
    ['clouds', 'clear-night'],
  ),
  fog: periods(
    ['fog', 'clouds'],
    ['fog', 'clouds'],
    ['fog', 'golden-hour'],
    ['fog', 'clear-night'],
  ),
  drizzle: periods(
    ['rain', 'clouds'],
    ['rain', 'clouds'],
    ['rain', 'golden-hour'],
    ['rain', 'clear-night'],
  ),
  rain: periods(
    ['rain', 'clouds'],
    ['rain', 'storm', 'clouds'],
    ['rain', 'storm'],
    ['rain', 'storm', 'clear-night'],
  ),
  snow: periods(
    ['snow', 'fog'],
    ['snow', 'clouds'],
    ['snow', 'golden-hour'],
    ['snow', 'clear-night'],
  ),
  storm: periods(
    ['storm', 'clouds'],
    ['storm', 'rain'],
    ['storm', 'rain'],
    ['storm', 'rain', 'clear-night'],
  ),
}

const WEATHER_CONDITIONS = new Set<WeatherConditionKind>([
  'clear',
  'partly-cloudy',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'snow',
  'storm',
])

const WEATHER_PHOTO_PERIODS = new Set<WeatherPhotoPeriod>([
  'morning',
  'afternoon',
  'evening',
  'night',
])

const WEATHER_PHOTO_IDS = new Set<WeatherPhotoId>(Object.keys(WEATHER_PHOTOS) as WeatherPhotoId[])

export const DEFAULT_WEATHER_PHOTO_PREFERENCES: WeatherPhotoPreferences = {
  enabled: true,
  favorites: {},
  version: 1,
}

const getStorage = (storage?: Storage | null) => {
  if (storage !== undefined) return storage
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const hashString = (value: string) => {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

const isWeatherPhotoKey = (value: string) => {
  const [condition, period, extra] = value.split(':')
  return !extra
    && WEATHER_CONDITIONS.has(condition as WeatherConditionKind)
    && WEATHER_PHOTO_PERIODS.has(period as WeatherPhotoPeriod)
}

export function getWeatherPhotoPeriod(hour: number): WeatherPhotoPeriod {
  if (hour >= 6 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 20) return 'evening'
  return 'night'
}

export const getWeatherPhotoKey = (
  condition: WeatherConditionKind,
  period: WeatherPhotoPeriod,
) => `${condition}:${period}`

export function selectWeatherPhoto(
  condition: WeatherConditionKind,
  period: WeatherPhotoPeriod,
  localDate: string,
  favoriteId?: WeatherPhotoId,
  excludedIds: readonly WeatherPhotoId[] = [],
): WeatherPhoto | null {
  const excluded = new Set(excludedIds)
  const candidates = WEATHER_PHOTO_CANDIDATES[condition][period]
  if (favoriteId
    && candidates.includes(favoriteId)
    && WEATHER_PHOTOS[favoriteId]
    && !excluded.has(favoriteId)) {
    return WEATHER_PHOTOS[favoriteId]
  }

  const startIndex = hashString(`${getWeatherPhotoKey(condition, period)}:${localDate}`)
    % candidates.length

  for (let offset = 0; offset < candidates.length; offset += 1) {
    const id = candidates[(startIndex + offset) % candidates.length]
    if (!excluded.has(id)) return WEATHER_PHOTOS[id]
  }

  return null
}

export function loadWeatherPhotoPreferences(
  storage?: Storage | null,
): WeatherPhotoPreferences {
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return { ...DEFAULT_WEATHER_PHOTO_PREFERENCES, favorites: {} }

  try {
    const rawValue = resolvedStorage.getItem(WEATHER_PHOTO_PREFERENCES_STORAGE_KEY)
    if (!rawValue) return { ...DEFAULT_WEATHER_PHOTO_PREFERENCES, favorites: {} }
    const value = JSON.parse(rawValue) as Partial<WeatherPhotoPreferences>
    if (value.version !== 1 || typeof value.enabled !== 'boolean') {
      return { ...DEFAULT_WEATHER_PHOTO_PREFERENCES, favorites: {} }
    }

    const favorites: Record<string, WeatherPhotoId> = {}
    if (value.favorites && typeof value.favorites === 'object') {
      for (const [key, id] of Object.entries(value.favorites)) {
        if (isWeatherPhotoKey(key) && WEATHER_PHOTO_IDS.has(id as WeatherPhotoId)) {
          favorites[key] = id as WeatherPhotoId
        }
      }
    }

    return { enabled: value.enabled, favorites, version: 1 }
  } catch {
    return { ...DEFAULT_WEATHER_PHOTO_PREFERENCES, favorites: {} }
  }
}

export function saveWeatherPhotoPreferences(
  preferences: WeatherPhotoPreferences,
  storage?: Storage | null,
) {
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return false

  try {
    resolvedStorage.setItem(WEATHER_PHOTO_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
    return true
  } catch {
    return false
  }
}

export function clearWeatherPhotoPreferences(storage?: Storage | null) {
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return false

  try {
    resolvedStorage.removeItem(WEATHER_PHOTO_PREFERENCES_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
