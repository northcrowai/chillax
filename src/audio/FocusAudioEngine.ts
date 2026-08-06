import focusNoiseProcessorUrl from './focus-noise-processor.ts?worker&url'

import type {
  AudioEngineState,
  FocusAudioEngineContract,
  Intensity,
  PresetId,
} from '../types'
import {
  getPreset,
  isProceduralPreset,
  type RecordedSoundSource,
} from '../data/presets'
import { getAudioProfile, type AudioProfile } from './profiles'

const PROCESSOR_NAME = 'chillax-focus-noise'
const START_STOP_FADE_SECONDS = 0.25
const CROSSFADE_SECONDS = 2
const VOLUME_SMOOTH_SECONDS = 0.05
const RECORDED_TEXTURE_SMOOTH_SECONDS = 0.3
const SAFE_OUTPUT_SCALE = 0.72

const RECORDED_TEXTURE: Readonly<
  Record<Intensity, { readonly brightnessHz: number; readonly trimGain: number }>
> = {
  soft: { brightnessHz: 3_200, trimGain: 0.52 },
  standard: { brightnessHz: 6_500, trimGain: 0.6 },
  strong: { brightnessHz: 10_000, trimGain: 0.68 },
}

interface BaseSoundDeck {
  readonly preset: PresetId
  intensity: Intensity
  readonly mix: GainNode
  readonly nodes: AudioNode[]
  cleanupTimer: ReturnType<typeof setTimeout> | null
  disposed: boolean
}

interface ProceduralSoundDeck extends BaseSoundDeck {
  readonly kind: 'procedural'
  readonly profile: AudioProfile
  readonly noise: AudioWorkletNode
  readonly oscillators: OscillatorNode[]
}

interface RecordedSoundDeck extends BaseSoundDeck {
  readonly kind: 'recorded'
  readonly recording: RecordedSoundSource
  readonly media: HTMLAudioElement
  readonly sourceNode: MediaElementAudioSourceNode
  readonly filter: BiquadFilterNode
  readonly trim: GainNode
  readonly onMediaError: (event: Event) => void
  fallbackDeck: SoundDeck | null
}

type SoundDeck = ProceduralSoundDeck | RecordedSoundDeck

export interface FocusAudioEngineOptions {
  onFatalError?: (error: Error) => void
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

const clampVolume = (value: number): number => (Number.isFinite(value) ? clamp(value, 0, 1) : 0)

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })

function disconnectSafely(node: AudioNode): void {
  try {
    node.disconnect()
  } catch {
    // The node may already have been disconnected during overlapping cleanup.
  }
}

function stopSafely(oscillator: OscillatorNode): void {
  try {
    oscillator.stop()
  } catch {
    // Oscillators can only be stopped once.
  }
}

function pauseSafely(media: HTMLAudioElement): void {
  try {
    media.pause()
  } catch {
    // A partially initialized element may not be able to pause.
  }
}

function releaseMediaSafely(media: HTMLAudioElement): void {
  pauseSafely(media)
  try {
    media.removeAttribute('src')
    media.load()
  } catch {
    // The element is already detached or the browser has released its resource.
  }
}

export class FocusAudioEngine implements FocusAudioEngineContract {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private limiter: DynamicsCompressorNode | null = null
  private activeDeck: SoundDeck | null = null
  private readonly fadingDecks = new Set<SoundDeck>()
  private readonly cleanupTimers = new Set<ReturnType<typeof setTimeout>>()
  private operation: Promise<void> = Promise.resolve()
  private processorRecoveryAttempts = 0
  private isReady = false
  private isPlaying = false
  private preset: PresetId = 'deep-work'
  private intensity: Intensity = 'standard'
  private volume = 0.6

  constructor(private readonly options: FocusAudioEngineOptions = {}) {}

  prepare(): Promise<void> {
    return this.enqueue(() => this.prepareInternal())
  }

  start(preset: PresetId, intensity: Intensity, volume: number): Promise<void> {
    this.preset = preset
    this.intensity = intensity
    this.volume = clampVolume(volume)

    return this.enqueue(async () => {
      this.processorRecoveryAttempts = 0

      await this.prepareInternal()
      const context = this.requireContext()
      const wasPlaying = this.isPlaying
      await this.ensureContextRunning(context)

      try {
        if (!this.activeDeck || !this.deckMatches(this.activeDeck, preset, intensity)) {
          await this.transitionTo(preset, intensity, {
            play: true,
            crossfade: wasPlaying,
          })
        } else {
          await this.playDeckMedia(this.activeDeck)
        }
      } catch (error) {
        this.restoreRequestedState(preset, intensity)
        if (!wasPlaying && context.state === 'running') await context.suspend()
        throw error
      }

      this.rampMaster(this.outputGain, START_STOP_FADE_SECONDS)
      this.isPlaying = true
    })
  }

  pause(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.isPlaying || !this.context) return

      this.rampMaster(0, START_STOP_FADE_SECONDS)
      await wait(START_STOP_FADE_SECONDS * 1_000 + 20)
      this.pauseAllMedia()
      if (this.context.state === 'running') await this.context.suspend()
      this.isPlaying = false
    })
  }

  resume(): Promise<void> {
    return this.enqueue(async () => {
      await this.prepareInternal()
      const context = this.requireContext()
      await this.ensureContextRunning(context)

      if (!this.activeDeck) {
        this.processorRecoveryAttempts = 0
        this.activeDeck = this.createPresetDeck(this.preset, this.intensity, 1)
      }

      try {
        await this.playDeckMedia(this.activeDeck)
      } catch (error) {
        if (context.state === 'running') await context.suspend()
        throw error
      }

      this.rampMaster(this.outputGain, START_STOP_FADE_SECONDS)
      this.isPlaying = true
    })
  }

  stop(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.context) {
        this.isPlaying = false
        return
      }

      if (this.isPlaying) {
        this.rampMaster(0, START_STOP_FADE_SECONDS)
        await wait(START_STOP_FADE_SECONDS * 1_000 + 20)
      }

      this.pauseAllMedia()
      this.disposeAllDecks()
      if (this.context.state === 'running') await this.context.suspend()
      this.isPlaying = false
    })
  }

  setPreset(preset: PresetId, intensity: Intensity): Promise<void> {
    this.preset = preset
    this.intensity = intensity

    return this.enqueue(async () => {
      if (!this.context || !this.activeDeck) return

      try {
        await this.transitionTo(preset, intensity, {
          play: this.isPlaying && this.context.state === 'running',
          crossfade: this.isPlaying && this.context.state === 'running',
        })
      } catch (error) {
        this.restoreRequestedState(preset, intensity)
        throw error
      }
    })
  }

  setIntensity(intensity: Intensity): Promise<void> {
    this.intensity = intensity

    return this.enqueue(async () => {
      if (!this.context || !this.activeDeck) return

      const preset = this.preset
      if (this.activeDeck.kind === 'recorded' && this.activeDeck.preset === preset) {
        this.updateRecordedTexture(this.activeDeck, intensity)
        return
      }

      try {
        await this.transitionTo(preset, intensity, {
          play: this.isPlaying && this.context.state === 'running',
          crossfade: this.isPlaying && this.context.state === 'running',
        })
      } catch (error) {
        this.restoreRequestedState(preset, intensity)
        throw error
      }
    })
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume)
    if (this.isPlaying) this.rampMaster(this.outputGain, VOLUME_SMOOTH_SECONDS)
  }

  playCompletionChime(): Promise<void> {
    return this.enqueue(async () => {
      await this.prepareInternal()
      const context = this.requireContext()
      const limiter = this.requireLimiter()
      const shouldSuspendAfterChime = !this.isPlaying
      await this.ensureContextRunning(context)

      const now = context.currentTime
      const chimeNodes: AudioNode[] = []
      const oscillators: OscillatorNode[] = []
      const peakGain = Math.max(0.0001, this.volume * 0.055)

      const addTone = (frequency: number, offset: number, duration: number): void => {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        const startsAt = now + offset
        const endsAt = startsAt + duration

        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequency, startsAt)
        gain.gain.setValueAtTime(0.0001, startsAt)
        gain.gain.exponentialRampToValueAtTime(peakGain, startsAt + 0.035)
        gain.gain.exponentialRampToValueAtTime(0.0001, endsAt)
        oscillator.connect(gain).connect(limiter)
        oscillator.start(startsAt)
        oscillator.stop(endsAt + 0.02)
        oscillators.push(oscillator)
        chimeNodes.push(oscillator, gain)
      }

      addTone(523.25, 0, 0.72)
      addTone(659.25, 0.18, 0.92)
      await wait(1_150)
      oscillators.forEach(stopSafely)
      chimeNodes.forEach(disconnectSafely)
      if (shouldSuspendAfterChime && !this.isPlaying && context.state === 'running') {
        await context.suspend()
      }
    })
  }

  getState(): AudioEngineState {
    return {
      isReady: this.isReady,
      isPlaying: this.isPlaying,
      preset: this.preset,
      intensity: this.intensity,
      volume: this.volume,
    }
  }

  dispose(): Promise<void> {
    return this.enqueue(async () => {
      const context = this.context
      if (!context) return

      if (this.isPlaying) {
        this.rampMaster(0, START_STOP_FADE_SECONDS)
        await wait(START_STOP_FADE_SECONDS * 1_000 + 20)
      }

      this.pauseAllMedia()
      this.disposeAllDecks()
      disconnectSafely(this.master as GainNode)
      disconnectSafely(this.limiter as DynamicsCompressorNode)
      if (context.state !== 'closed') await context.close()

      this.context = null
      this.master = null
      this.limiter = null
      this.isReady = false
      this.isPlaying = false
      this.processorRecoveryAttempts = 0
    })
  }

  private get outputGain(): number {
    return this.volume * SAFE_OUTPUT_SCALE
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.operation.catch(() => undefined).then(operation)
    this.operation = next
    return next
  }

  private async prepareInternal(): Promise<void> {
    if (this.context && this.context.state !== 'closed') return
    if (typeof AudioContext === 'undefined') {
      throw new Error('Web Audio is not supported in this browser.')
    }

    const context = new AudioContext({ latencyHint: 'playback' })
    try {
      await context.audioWorklet.addModule(focusNoiseProcessorUrl)

      const master = context.createGain()
      const limiter = context.createDynamicsCompressor()
      master.gain.value = 0
      limiter.threshold.value = -16
      limiter.knee.value = 6
      limiter.ratio.value = 16
      limiter.attack.value = 0.003
      limiter.release.value = 0.25
      master.connect(limiter).connect(context.destination)

      this.context = context
      this.master = master
      this.limiter = limiter
      this.isReady = true
    } catch (error) {
      await context.close()
      throw error
    }
  }

  private async ensureContextRunning(context: AudioContext): Promise<void> {
    if (context.state === 'suspended') await context.resume()
    if (context.state !== 'running') {
      throw new Error(`The audio context could not start (state: ${context.state}).`)
    }
  }

  private createPresetDeck(
    preset: PresetId,
    intensity: Intensity,
    initialGain: number,
  ): SoundDeck {
    if (isProceduralPreset(preset)) {
      return this.createProceduralDeck(getAudioProfile(preset, intensity), initialGain)
    }

    const definition = getPreset(preset)
    if (definition.source.type !== 'recorded') {
      throw new Error(`The sound source for ${definition.name} is unavailable.`)
    }
    return this.createRecordedDeck(preset, intensity, definition.source, initialGain)
  }

  private createProceduralDeck(profile: AudioProfile, initialGain: number): ProceduralSoundDeck {
    const context = this.requireContext()
    const master = this.requireMaster()
    const mix = context.createGain()
    const noiseFilter = context.createBiquadFilter()
    const padFilter = context.createBiquadFilter()
    const padGain = context.createGain()
    const panner = context.createStereoPanner()
    const motionOscillator = context.createOscillator()
    const motionGain = context.createGain()
    const oscillators: OscillatorNode[] = []
    const nodes: AudioNode[] = [mix, noiseFilter, padFilter, padGain, panner, motionOscillator, motionGain]

    mix.gain.setValueAtTime(initialGain, context.currentTime)
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.value = profile.brightnessHz
    noiseFilter.Q.value = 0.45
    padFilter.type = 'lowpass'
    padFilter.frequency.value = Math.min(3_200, profile.brightnessHz * 1.3)
    padFilter.Q.value = 0.6
    padGain.gain.value = profile.padGain

    const noise = new AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: profile.noise,
    })
    nodes.push(noise)
    noise.connect(noiseFilter).connect(mix)

    const voiceGainValue = 0.48 / profile.chordHz.length
    profile.chordHz.forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const voiceGain = context.createGain()
      oscillator.type = index % 2 === 0 ? 'sine' : 'triangle'
      oscillator.frequency.value = frequency
      oscillator.detune.value = index % 2 === 0 ? -4 : 4
      voiceGain.gain.value = voiceGainValue
      oscillator.connect(voiceGain).connect(padFilter)
      oscillator.start()
      oscillators.push(oscillator)
      nodes.push(oscillator, voiceGain)
    })

    padFilter.connect(padGain).connect(panner).connect(mix)
    motionOscillator.type = 'sine'
    motionOscillator.frequency.value = profile.motionRateHz
    motionGain.gain.value = profile.motionDepth
    motionOscillator.connect(motionGain).connect(panner.pan)
    motionOscillator.start()
    oscillators.push(motionOscillator)
    mix.connect(master)

    const deck: ProceduralSoundDeck = {
      kind: 'procedural',
      preset: profile.preset,
      intensity: profile.intensity,
      profile,
      mix,
      noise,
      nodes,
      oscillators,
      cleanupTimer: null,
      disposed: false,
    }
    noise.onprocessorerror = () => {
      void this.handleProcessorError(deck)
    }
    return deck
  }

  private createRecordedDeck(
    preset: PresetId,
    intensity: Intensity,
    recording: RecordedSoundSource,
    initialGain: number,
  ): RecordedSoundDeck {
    if (!recording.src.startsWith('/') || recording.src.startsWith('//')) {
      throw new Error('Recorded sound files must use a same-origin path.')
    }
    if (typeof Audio === 'undefined') {
      throw new Error('Recorded audio is not supported in this browser.')
    }

    const context = this.requireContext()
    const master = this.requireMaster()
    const media = new Audio()
    media.loop = true
    media.preload = 'metadata'
    media.autoplay = false
    media.src = recording.src
    media.volume = 1

    const sourceNode = context.createMediaElementSource(media)
    const filter = context.createBiquadFilter()
    const trim = context.createGain()
    const mix = context.createGain()
    const texture = RECORDED_TEXTURE[intensity]

    filter.type = 'lowpass'
    filter.frequency.value = texture.brightnessHz
    filter.Q.value = 0.55
    trim.gain.value = texture.trimGain
    mix.gain.setValueAtTime(initialGain, context.currentTime)
    sourceNode.connect(filter).connect(trim).connect(mix).connect(master)

    const deck: RecordedSoundDeck = {
      kind: 'recorded',
      preset,
      intensity,
      recording,
      media,
      sourceNode,
      filter,
      trim,
      mix,
      nodes: [sourceNode, filter, trim, mix],
      cleanupTimer: null,
      disposed: false,
      onMediaError: () => {
        void this.handleRecordedMediaError(deck)
      },
      fallbackDeck: null,
    }
    media.addEventListener('error', deck.onMediaError)
    return deck
  }

  private async transitionTo(
    preset: PresetId,
    intensity: Intensity,
    options: { readonly play: boolean; readonly crossfade: boolean; readonly force?: boolean },
  ): Promise<void> {
    const previousDeck = this.activeDeck
    if (!options.force && previousDeck && this.deckMatches(previousDeck, preset, intensity)) return

    const shouldCrossfade = Boolean(previousDeck && options.crossfade)
    let nextDeck: SoundDeck | null = null
    try {
      nextDeck = this.createPresetDeck(preset, intensity, shouldCrossfade ? 0 : 1)
      if (options.play) await this.playDeckMedia(nextDeck)
    } catch (error) {
      if (nextDeck) this.disposeDeck(nextDeck)
      throw error
    }

    this.activeDeck = nextDeck
    if (!previousDeck) return

    if (!shouldCrossfade) {
      this.disposeDeck(previousDeck)
      return
    }

    const context = this.requireContext()
    if (nextDeck.kind === 'recorded') nextDeck.fallbackDeck = previousDeck
    this.rampGain(nextDeck.mix.gain, 1, CROSSFADE_SECONDS, context.currentTime)
    this.fadingDecks.add(previousDeck)
    this.rampGain(previousDeck.mix.gain, 0, CROSSFADE_SECONDS, context.currentTime)
    this.scheduleDeckCleanup(previousDeck, CROSSFADE_SECONDS * 1_000 + 50)
  }

  private async playDeckMedia(deck: SoundDeck): Promise<void> {
    if (deck.kind !== 'recorded') return
    try {
      await deck.media.play()
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown playback error'
      throw new Error(`The ${getPreset(deck.preset).name} recording could not start: ${reason}`)
    }
  }

  private updateRecordedTexture(deck: RecordedSoundDeck, intensity: Intensity): void {
    if (deck.disposed || deck.intensity === intensity) return
    const context = this.requireContext()
    const texture = RECORDED_TEXTURE[intensity]
    this.rampGain(
      deck.filter.frequency,
      texture.brightnessHz,
      RECORDED_TEXTURE_SMOOTH_SECONDS,
      context.currentTime,
    )
    this.rampGain(
      deck.trim.gain,
      texture.trimGain,
      RECORDED_TEXTURE_SMOOTH_SECONDS,
      context.currentTime,
    )
    deck.intensity = intensity
  }

  private async handleProcessorError(deck: ProceduralSoundDeck): Promise<void> {
    return this.enqueue(async () => {
      if (deck.disposed || deck !== this.activeDeck) return

      if (this.processorRecoveryAttempts >= 1) {
        const context = this.requireContext()
        this.rampGain(deck.mix.gain, 0, START_STOP_FADE_SECONDS, context.currentTime)
        this.fadingDecks.add(deck)
        this.scheduleDeckCleanup(deck, START_STOP_FADE_SECONDS * 1_000 + 20)
        this.activeDeck = null
        this.rampMaster(0, START_STOP_FADE_SECONDS)
        this.isPlaying = false
        this.scheduleContextSuspension(context, START_STOP_FADE_SECONDS * 1_000 + 20)
        this.notifyFatalError(
          new Error('The audio processor stopped after its automatic recovery failed.'),
        )
        return
      }

      this.processorRecoveryAttempts += 1
      await this.transitionTo(deck.profile.preset, deck.profile.intensity, {
        play: true,
        crossfade: true,
        force: true,
      })
    })
  }

  private async handleRecordedMediaError(deck: RecordedSoundDeck): Promise<void> {
    return this.enqueue(async () => {
      if (deck.disposed || deck !== this.activeDeck || !this.isPlaying) return

      const context = this.requireContext()
      const fallbackDeck = deck.fallbackDeck
      if (fallbackDeck && !fallbackDeck.disposed) {
        this.cancelDeckCleanup(fallbackDeck)
        this.fadingDecks.delete(fallbackDeck)
        this.activeDeck = fallbackDeck
        deck.fallbackDeck = null
        this.rampGain(fallbackDeck.mix.gain, 1, START_STOP_FADE_SECONDS, context.currentTime)
        this.rampGain(deck.mix.gain, 0, START_STOP_FADE_SECONDS, context.currentTime)
        this.fadingDecks.add(deck)
        this.scheduleDeckCleanup(deck, START_STOP_FADE_SECONDS * 1_000 + 20)
        this.preset = fallbackDeck.preset
        this.intensity = fallbackDeck.intensity
        return
      }

      this.rampGain(deck.mix.gain, 0, START_STOP_FADE_SECONDS, context.currentTime)
      this.fadingDecks.add(deck)
      this.scheduleDeckCleanup(deck, START_STOP_FADE_SECONDS * 1_000 + 20)
      this.activeDeck = null
      this.rampMaster(0, START_STOP_FADE_SECONDS)
      this.isPlaying = false
      this.scheduleContextSuspension(context, START_STOP_FADE_SECONDS * 1_000 + 20)
      this.notifyFatalError(new Error('The selected recording stopped unexpectedly.'))
    })
  }

  private notifyFatalError(error: Error): void {
    try {
      this.options.onFatalError?.(error)
    } catch {
      // Consumer callbacks must not break the engine's serialized cleanup queue.
    }
  }

  private restoreRequestedState(failedPreset: PresetId, failedIntensity: Intensity): void {
    if (!this.activeDeck) return
    if (this.preset === failedPreset) this.preset = this.activeDeck.preset
    if (this.intensity === failedIntensity) this.intensity = this.activeDeck.intensity
  }

  private rampMaster(target: number, durationSeconds: number): void {
    if (!this.context || !this.master) return
    this.rampGain(this.master.gain, target, durationSeconds, this.context.currentTime)
  }

  private rampGain(
    parameter: AudioParam,
    target: number,
    durationSeconds: number,
    now: number,
  ): void {
    if (typeof parameter.cancelAndHoldAtTime === 'function') {
      parameter.cancelAndHoldAtTime(now)
    } else {
      parameter.cancelScheduledValues(now)
      parameter.setValueAtTime(parameter.value, now)
    }
    parameter.linearRampToValueAtTime(target, now + durationSeconds)
  }

  private scheduleDeckCleanup(deck: SoundDeck, delayMilliseconds: number): void {
    this.cancelDeckCleanup(deck)
    const timer = setTimeout(() => {
      this.cleanupTimers.delete(timer)
      deck.cleanupTimer = null
      this.fadingDecks.delete(deck)
      this.disposeDeck(deck)
    }, delayMilliseconds)
    deck.cleanupTimer = timer
    this.cleanupTimers.add(timer)
  }

  private cancelDeckCleanup(deck: SoundDeck): void {
    if (!deck.cleanupTimer) return
    clearTimeout(deck.cleanupTimer)
    this.cleanupTimers.delete(deck.cleanupTimer)
    deck.cleanupTimer = null
  }

  private scheduleContextSuspension(context: AudioContext, delayMilliseconds: number): void {
    const timer = setTimeout(() => {
      this.cleanupTimers.delete(timer)
      if (!this.isPlaying && !this.activeDeck && context.state === 'running') {
        void context.suspend()
      }
    }, delayMilliseconds)
    this.cleanupTimers.add(timer)
  }

  private pauseAllMedia(): void {
    if (this.activeDeck?.kind === 'recorded') pauseSafely(this.activeDeck.media)
    this.fadingDecks.forEach((deck) => {
      if (deck.kind === 'recorded') pauseSafely(deck.media)
    })
  }

  private disposeDeck(deck: SoundDeck): void {
    if (deck.disposed) return
    deck.disposed = true
    this.cancelDeckCleanup(deck)

    if (deck.kind === 'procedural') {
      deck.noise.onprocessorerror = null
      deck.oscillators.forEach(stopSafely)
    } else {
      deck.media.removeEventListener('error', deck.onMediaError)
      releaseMediaSafely(deck.media)
      deck.fallbackDeck = null
    }

    if (this.activeDeck?.kind === 'recorded' && this.activeDeck.fallbackDeck === deck) {
      this.activeDeck.fallbackDeck = null
    }
    deck.nodes.forEach(disconnectSafely)
  }

  private disposeAllDecks(): void {
    this.cleanupTimers.forEach(clearTimeout)
    this.cleanupTimers.clear()
    if (this.activeDeck) this.disposeDeck(this.activeDeck)
    this.activeDeck = null
    this.fadingDecks.forEach((deck) => this.disposeDeck(deck))
    this.fadingDecks.clear()
  }

  private deckMatches(deck: SoundDeck, preset: PresetId, intensity: Intensity): boolean {
    return deck.preset === preset && deck.intensity === intensity
  }

  private requireContext(): AudioContext {
    if (!this.context) throw new Error('The audio engine has not been prepared.')
    return this.context
  }

  private requireMaster(): GainNode {
    if (!this.master) throw new Error('The audio engine has not been prepared.')
    return this.master
  }

  private requireLimiter(): DynamicsCompressorNode {
    if (!this.limiter) throw new Error('The audio engine has not been prepared.')
    return this.limiter
  }
}
