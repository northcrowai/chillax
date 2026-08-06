import { afterEach, describe, expect, it, vi } from 'vitest'

const registerSW = vi.hoisted(() => vi.fn(() => vi.fn(async () => undefined)))

vi.mock('virtual:pwa-register', () => ({ registerSW }))

import { isChillaxOfflineReady, registerChillaxServiceWorker } from './pwa'

const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')

const setServiceWorker = (value: Partial<ServiceWorkerContainer>) => {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value,
  })
}

describe('Chillax service worker helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker)
    } else {
      Reflect.deleteProperty(navigator, 'serviceWorker')
    }
  })

  it('registers immediately with the supplied lifecycle callbacks', () => {
    const onNeedRefresh = vi.fn()
    const onOfflineReady = vi.fn()

    registerChillaxServiceWorker({ onNeedRefresh, onOfflineReady })

    expect(registerSW).toHaveBeenCalledWith(expect.objectContaining({
      immediate: true,
      onNeedRefresh,
      onOfflineReady,
    }))
  })

  it('recognizes an active cached app after a later page reload', async () => {
    setServiceWorker({
      controller: null,
      getRegistration: vi.fn(async () => ({ active: {} as ServiceWorker }) as ServiceWorkerRegistration),
    })

    await expect(isChillaxOfflineReady()).resolves.toBe(true)
  })

  it('fails closed when service-worker state cannot be read', async () => {
    setServiceWorker({
      controller: null,
      getRegistration: vi.fn(async () => {
        throw new Error('Storage is unavailable')
      }),
    })

    await expect(isChillaxOfflineReady()).resolves.toBe(false)
  })
})
