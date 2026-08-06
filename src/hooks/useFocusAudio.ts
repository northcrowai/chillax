import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type {
  AudioEngineState,
  FocusAudioEngineContract,
  Intensity,
  PresetId,
} from '../types'

const INITIAL_STATE: AudioEngineState = {
  isReady: false,
  isPlaying: false,
  preset: 'deep-work',
  intensity: 'standard',
  volume: 0.55,
}

const toFriendlyError = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Your browser blocked audio. Select Begin again to allow sound.'
  }
  if (error instanceof Error && /not supported/i.test(error.message)) {
    return 'This browser cannot create Chillax soundscapes. Use the latest Edge or Chrome.'
  }
  return 'The soundscape could not start. Check your audio output and try again.'
}

export function useFocusAudio() {
  const engineRef = useRef<FocusAudioEngineContract | null>(null)
  const enginePromiseRef = useRef<Promise<FocusAudioEngineContract> | null>(null)
  const [state, setState] = useState<AudioEngineState>(INITIAL_STATE)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fatalErrorVersion, setFatalErrorVersion] = useState(0)

  const handleFatalError = useCallback((fatalError: Error) => {
    const engine = engineRef.current
    if (engine) setState(engine.getState())
    setError(
      `${fatalError.message} Your session was paused; select Resume when you are ready to try again.`,
    )
    setFatalErrorVersion((version) => version + 1)
  }, [])

  const getEngine = useCallback(async () => {
    if (engineRef.current) return engineRef.current
    if (!enginePromiseRef.current) {
      enginePromiseRef.current = import('../audio')
        .then(({ FocusAudioEngine }) => {
          const engine = new FocusAudioEngine({ onFatalError: handleFatalError })
          engineRef.current = engine
          return engine
        })
        .catch((importError: unknown) => {
          enginePromiseRef.current = null
          throw importError
        })
    }
    return enginePromiseRef.current
  }, [handleFatalError])

  const syncState = useCallback((engine: FocusAudioEngineContract) => {
    setState(engine.getState())
  }, [])

  const run = useCallback(async (
    operation: (engine: FocusAudioEngineContract) => Promise<void>,
    showBusy = true,
  ) => {
    if (showBusy) setIsBusy(true)
    setError(null)
    try {
      const engine = await getEngine()
      await operation(engine)
      syncState(engine)
      return true
    } catch (operationError) {
      setError(toFriendlyError(operationError))
      return false
    } finally {
      if (showBusy) setIsBusy(false)
    }
  }, [getEngine, syncState])

  const start = useCallback(
    (preset: PresetId, intensity: Intensity, volume: number) =>
      run((engine) => engine.start(preset, intensity, volume)),
    [run],
  )

  const pause = useCallback(
    () => run((engine) => engine.pause()),
    [run],
  )

  const stop = useCallback(
    () => run((engine) => engine.stop()),
    [run],
  )

  const setPreset = useCallback(
    (preset: PresetId, intensity: Intensity) => {
      const engine = engineRef.current
      if (!engine) return Promise.resolve(true)
      return run((currentEngine) => currentEngine.setPreset(preset, intensity), false)
    },
    [run],
  )

  const setIntensity = useCallback(
    (intensity: Intensity) => {
      const engine = engineRef.current
      if (!engine) return Promise.resolve(true)
      return run((currentEngine) => currentEngine.setIntensity(intensity), false)
    },
    [run],
  )

  const setVolume = useCallback((volume: number) => {
    const engine = engineRef.current
    if (engine) {
      engine.setVolume(volume)
      syncState(engine)
    } else {
      setState((current) => ({ ...current, volume }))
    }
  }, [syncState])

  const playCompletionChime = useCallback(
    () => run((engine) => engine.playCompletionChime(), false),
    [run],
  )

  const clearError = useCallback(() => setError(null), [])

  useEffect(() => () => {
    const engine = engineRef.current
    const pendingEngine = enginePromiseRef.current
    engineRef.current = null
    enginePromiseRef.current = null
    if (engine) {
      void engine.dispose()
    } else if (pendingEngine) {
      void pendingEngine.then((resolvedEngine) => resolvedEngine.dispose()).catch(() => undefined)
    }
  }, [])

  return {
    state,
    isBusy,
    error,
    fatalErrorVersion,
    clearError,
    start,
    pause,
    stop,
    setPreset,
    setIntensity,
    setVolume,
    playCompletionChime,
  }
}
