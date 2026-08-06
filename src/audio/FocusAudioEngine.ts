import focusNoiseProcessorUrl from './focus-noise-processor.ts?worker&url'

import type {
  AudioEngineState,
  FocusAudioEngineContract,
  Intensity,
  PresetId,
} from '../types'
import { getAudioProfile, type AudioProfile } from './profiles'

const PROCESSOR_NAME = 'chillax-focus-noise'
const START_STOP_FADE_SECONDS = 0.25
const CROSSFADE_SECONDS = 2
const VOLUME_SMOOTH_SECONDS = 0.05
const SAFE_OUTPUT_SCALE = 0.72

interface SoundDeck {
  readonly profile: AudioProfile
  readonly mix: GainNode
  readonly noise: AudioWorkletNode
  readonly nodes: AudioNode[]
  readonly oscillators: OscillatorNode[]
  disposed: boolean
}

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
      await this.ensureContextRunning(context)

      const requestedProfile = getAudioProfile(preset, intensity)
      if (!this.activeDeck) {
        this.activeDeck = this.createDeck(requestedProfile, 1)
      } else if (!this.deckMatches(this.activeDeck, preset, intensity)) {
        this.crossfadeTo(requestedProfile)
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
        this.activeDeck = this.createDeck(getAudioProfile(this.preset, this.intensity), 1)
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

      const profile = getAudioProfile(preset, intensity)
      if (this.isPlaying && this.context.state === 'running') {
        this.crossfadeTo(profile)
      } else {
        this.replaceDeckWhileSilent(profile)
      }
    })
  }

  setIntensity(intensity: Intensity): Promise<void> {
    this.intensity = intensity

    return this.enqueue(async () => {
      if (!this.context || !this.activeDeck) return

      const profile = getAudioProfile(this.preset, intensity)
      if (this.isPlaying && this.context.state === 'running') {
        this.crossfadeTo(profile)
      } else {
        this.replaceDeckWhileSilent(profile)
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

  private createDeck(profile: AudioProfile, initialGain: number): SoundDeck {
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

    const deck: SoundDeck = { profile, mix, noise, nodes, oscillators, disposed: false }
    noise.onprocessorerror = () => {
      void this.handleProcessorError(deck)
    }
    return deck
  }

  private crossfadeTo(profile: AudioProfile): void {
    const context = this.requireContext()
    const nextDeck = this.createDeck(profile, 0)
    const previousDeck = this.activeDeck
    this.activeDeck = nextDeck

    this.rampGain(nextDeck.mix.gain, 1, CROSSFADE_SECONDS, context.currentTime)
    if (previousDeck) {
      this.fadingDecks.add(previousDeck)
      this.rampGain(previousDeck.mix.gain, 0, CROSSFADE_SECONDS, context.currentTime)
      this.scheduleDeckCleanup(previousDeck, CROSSFADE_SECONDS * 1_000 + 50)
    }
  }

  private replaceDeckWhileSilent(profile: AudioProfile): void {
    const previousDeck = this.activeDeck
    this.activeDeck = this.createDeck(profile, 1)
    if (previousDeck) this.disposeDeck(previousDeck)
  }

  private async handleProcessorError(deck: SoundDeck): Promise<void> {
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
        try {
          this.options.onFatalError?.(
            new Error('The audio processor stopped after its automatic recovery failed.'),
          )
        } catch {
          // Consumer callbacks must not break the engine's serialized cleanup queue.
        }
        return
      }

      this.processorRecoveryAttempts += 1
      this.crossfadeTo(deck.profile)
    })
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
    const timer = setTimeout(() => {
      this.cleanupTimers.delete(timer)
      this.fadingDecks.delete(deck)
      this.disposeDeck(deck)
    }, delayMilliseconds)
    this.cleanupTimers.add(timer)
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

  private disposeDeck(deck: SoundDeck): void {
    if (deck.disposed) return
    deck.disposed = true
    deck.noise.onprocessorerror = null
    deck.oscillators.forEach(stopSafely)
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
    return deck.profile.preset === preset && deck.profile.intensity === intensity
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
