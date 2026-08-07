import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WEATHER_PHOTO_PREFERENCES,
  WEATHER_PHOTO_PREFERENCES_STORAGE_KEY,
  clearWeatherPhotoPreferences,
  getWeatherPhotoKey,
  getWeatherPhotoPeriod,
  loadWeatherPhotoPreferences,
  saveWeatherPhotoPreferences,
  selectWeatherPhoto,
} from './weatherPhotos'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() {
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
    this.values.set(key, value)
  }
}

class ThrowingStorage extends MemoryStorage {
  override getItem(_key: string): string | null {
    throw new Error('Storage unavailable')
  }

  override removeItem(_key: string): void {
    throw new Error('Storage unavailable')
  }

  override setItem(_key: string, _value: string): void {
    throw new Error('Storage unavailable')
  }
}

describe('weather photography', () => {
  it('uses the four local-time periods from the reference behavior', () => {
    expect(getWeatherPhotoPeriod(0)).toBe('night')
    expect(getWeatherPhotoPeriod(5)).toBe('night')
    expect(getWeatherPhotoPeriod(6)).toBe('morning')
    expect(getWeatherPhotoPeriod(11)).toBe('morning')
    expect(getWeatherPhotoPeriod(12)).toBe('afternoon')
    expect(getWeatherPhotoPeriod(16)).toBe('afternoon')
    expect(getWeatherPhotoPeriod(17)).toBe('evening')
    expect(getWeatherPhotoPeriod(19)).toBe('evening')
    expect(getWeatherPhotoPeriod(20)).toBe('night')
    expect(getWeatherPhotoPeriod(23)).toBe('night')
  })

  it('chooses a stable same-origin photo for condition, period, and day', () => {
    const first = selectWeatherPhoto('clear', 'afternoon', '2026-08-06')
    const second = selectWeatherPhoto('clear', 'afternoon', '2026-08-06')

    expect(second).toEqual(first)
    expect(first?.src).toMatch(/^\/weather-photos\/.+\.webp$/)
    expect(first?.authorUrl).toMatch(/^https:\/\/unsplash\.com\/@/)
  })

  it('honors a favorite and can fall through failed local assets', () => {
    const favorite = selectWeatherPhoto('rain', 'night', '2026-08-06', 'storm')
    expect(favorite?.id).toBe('storm')

    const fallback = selectWeatherPhoto(
      'rain',
      'night',
      '2026-08-06',
      'storm',
      ['storm'],
    )
    expect(fallback?.id).not.toBe('storm')

    const invalidFavorite = selectWeatherPhoto(
      'rain',
      'night',
      '2026-08-06',
      'golden-hour',
    )
    expect(invalidFavorite?.id).not.toBe('golden-hour')

    const unavailable = selectWeatherPhoto(
      'clear',
      'morning',
      '2026-08-06',
      undefined,
      ['clear-day', 'golden-hour'],
    )
    expect(unavailable).toBeNull()
  })

  it('loads defaults, saves choices, and clears them', () => {
    const storage = new MemoryStorage()
    expect(loadWeatherPhotoPreferences(storage)).toEqual(DEFAULT_WEATHER_PHOTO_PREFERENCES)

    const preferences = {
      enabled: false,
      favorites: { [getWeatherPhotoKey('snow', 'morning')]: 'snow' as const },
      version: 1 as const,
    }
    expect(saveWeatherPhotoPreferences(preferences, storage)).toBe(true)
    expect(loadWeatherPhotoPreferences(storage)).toEqual(preferences)
    expect(clearWeatherPhotoPreferences(storage)).toBe(true)
    expect(storage.getItem(WEATHER_PHOTO_PREFERENCES_STORAGE_KEY)).toBeNull()
  })

  it('ignores malformed preferences and unsafe favorite entries', () => {
    const storage = new MemoryStorage()
    storage.setItem(WEATHER_PHOTO_PREFERENCES_STORAGE_KEY, '{broken')
    expect(loadWeatherPhotoPreferences(storage)).toEqual(DEFAULT_WEATHER_PHOTO_PREFERENCES)

    storage.setItem(WEATHER_PHOTO_PREFERENCES_STORAGE_KEY, JSON.stringify({
      enabled: true,
      favorites: {
        'clear:morning': 'clear-day',
        'invalid:key': 'storm',
        'rain:night': 'not-a-photo',
      },
      version: 1,
    }))
    expect(loadWeatherPhotoPreferences(storage)).toEqual({
      enabled: true,
      favorites: { 'clear:morning': 'clear-day' },
      version: 1,
    })

    storage.setItem(WEATHER_PHOTO_PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 2 }))
    expect(loadWeatherPhotoPreferences(storage)).toEqual(DEFAULT_WEATHER_PHOTO_PREFERENCES)
  })

  it('fails safely when browser storage is unavailable', () => {
    expect(loadWeatherPhotoPreferences(null)).toEqual(DEFAULT_WEATHER_PHOTO_PREFERENCES)
    expect(saveWeatherPhotoPreferences(DEFAULT_WEATHER_PHOTO_PREFERENCES, null)).toBe(false)
    expect(clearWeatherPhotoPreferences(null)).toBe(false)

    const storage = new ThrowingStorage()
    expect(loadWeatherPhotoPreferences(storage)).toEqual(DEFAULT_WEATHER_PHOTO_PREFERENCES)
    expect(saveWeatherPhotoPreferences(DEFAULT_WEATHER_PHOTO_PREFERENCES, storage)).toBe(false)
    expect(clearWeatherPhotoPreferences(storage)).toBe(false)
  })
})
