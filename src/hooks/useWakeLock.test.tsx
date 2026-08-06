import { act, renderHook } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from './useWakeLock'

class FakeWakeLockSentinel extends EventTarget implements WakeLockSentinel {
  onrelease: ((this: WakeLockSentinel, event: Event) => unknown) | null = null
  released = false
  readonly type: WakeLockType = 'screen'

  async release() {
    if (this.released) {
      return
    }
    this.released = true
    this.dispatchEvent(new Event('release'))
  }
}

const setWakeLock = (wakeLock: WakeLock | undefined) => {
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: wakeLock,
  })
}

const setVisibility = (visibilityState: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

const flushPromises = () => act(async () => {
  await Promise.resolve()
})

describe('useWakeLock', () => {
  beforeEach(() => {
    setVisibility('visible')
    setWakeLock(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setWakeLock(undefined)
  })

  it('reports unsupported browsers without throwing', () => {
    const { result } = renderHook(() => useWakeLock(true))

    expect(result.current).toEqual({
      isSupported: false,
      isActive: false,
      error: null,
    })
  })

  it('acquires and releases the screen wake lock when enabled changes', async () => {
    const sentinel = new FakeWakeLockSentinel()
    const request = vi.fn().mockResolvedValue(sentinel)
    setWakeLock({ request } as WakeLock)
    const { result, rerender } = renderHook(
      ({ enabled }) => useWakeLock(enabled),
      { initialProps: { enabled: true } },
    )

    await flushPromises()
    expect(request).toHaveBeenCalledWith('screen')
    expect(result.current.isActive).toBe(true)

    rerender({ enabled: false })
    await flushPromises()
    expect(sentinel.released).toBe(true)
    expect(result.current.isActive).toBe(false)
  })

  it('releases while hidden and reacquires on visibility return', async () => {
    const firstSentinel = new FakeWakeLockSentinel()
    const secondSentinel = new FakeWakeLockSentinel()
    const request = vi.fn()
      .mockResolvedValueOnce(firstSentinel)
      .mockResolvedValueOnce(secondSentinel)
    setWakeLock({ request } as WakeLock)
    const { result } = renderHook(() => useWakeLock(true))

    await flushPromises()
    expect(result.current.isActive).toBe(true)

    await act(async () => {
      setVisibility('hidden')
      await Promise.resolve()
    })
    expect(firstSentinel.released).toBe(true)
    expect(result.current.isActive).toBe(false)

    await act(async () => {
      setVisibility('visible')
      await Promise.resolve()
    })
    expect(request).toHaveBeenCalledTimes(2)
    expect(result.current.isActive).toBe(true)
  })

  it('surfaces permission errors without rejecting the component', async () => {
    const request = vi.fn().mockRejectedValue(new Error('Permission denied'))
    setWakeLock({ request } as WakeLock)
    const { result } = renderHook(() => useWakeLock(true))

    await flushPromises()
    expect(result.current).toEqual({
      isSupported: true,
      isActive: false,
      error: 'Permission denied',
    })
  })
})
