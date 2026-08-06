import { useEffect, useState } from 'preact/hooks'

export interface WakeLockState {
  isSupported: boolean
  isActive: boolean
  error: string | null
}

const hasWakeLockSupport = () =>
  typeof navigator !== 'undefined'
  && 'wakeLock' in navigator
  && typeof navigator.wakeLock?.request === 'function'

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'The screen wake lock could not be enabled.'

export function useWakeLock(enabled: boolean): WakeLockState {
  const isSupported = hasWakeLockSupport()
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !isSupported) {
      setIsActive(false)
      setError(null)
      return
    }

    let disposed = false
    let requestPending = false
    let sentinel: WakeLockSentinel | null = null

    const handleRelease = () => {
      sentinel = null
      if (!disposed) {
        setIsActive(false)
      }
    }

    const release = async () => {
      const currentSentinel = sentinel
      sentinel = null
      if (currentSentinel) {
        currentSentinel.removeEventListener('release', handleRelease)
        try {
          await currentSentinel.release()
        } catch {
          // The browser may have already released it while the page was hidden.
        }
      }
      if (!disposed) {
        setIsActive(false)
      }
    }

    const acquire = async () => {
      if (disposed
        || requestPending
        || sentinel
        || document.visibilityState !== 'visible') {
        return
      }

      requestPending = true
      try {
        const requestedSentinel = await navigator.wakeLock.request('screen')
        if (disposed || document.visibilityState !== 'visible') {
          await requestedSentinel.release()
          return
        }

        sentinel = requestedSentinel
        sentinel.addEventListener('release', handleRelease)
        setError(null)
        setIsActive(true)
      } catch (requestError) {
        if (!disposed) {
          setIsActive(false)
          setError(getErrorMessage(requestError))
        }
      } finally {
        requestPending = false
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void acquire()
      } else {
        void release()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    void acquire()

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void release()
    }
  }, [enabled, isSupported])

  return { isSupported, isActive, error }
}
