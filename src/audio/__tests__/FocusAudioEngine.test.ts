import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FocusAudioEngine } from '../FocusAudioEngine'

class MockAudioParam {
  value = 0
  readonly ramps: Array<{ target: number; time: number }> = []

  cancelAndHoldAtTime(_time: number): MockAudioParam {
    return this
  }

  cancelScheduledValues(_time: number): MockAudioParam {
    return this
  }

  setValueAtTime(value: number, _time: number): MockAudioParam {
    this.value = value
    return this
  }

  linearRampToValueAtTime(value: number, time: number): MockAudioParam {
    this.value = value
    this.ramps.push({ target: value, time })
    return this
  }

  exponentialRampToValueAtTime(value: number, time: number): MockAudioParam {
    this.value = value
    this.ramps.push({ target: value, time })
    return this
  }
}

class MockAudioNode {
  readonly connections: MockAudioNode[] = []
  disconnected = false

  connect<T extends MockAudioNode>(destination: T): T {
    this.connections.push(destination)
    return destination
  }

  disconnect(): void {
    this.disconnected = true
    this.connections.length = 0
  }
}

class MockMediaElementAudioSourceNode extends MockAudioNode {
  constructor(readonly mediaElement: MockHTMLAudioElement) {
    super()
  }
}

class MockHTMLAudioElement {
  static readonly instances: MockHTMLAudioElement[] = []
  static rejectNextPlay = false

  autoplay = false
  loop = false
  preload = 'none'
  src = ''
  volume = 1
  paused = true
  readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
  readonly pause = vi.fn(() => {
    this.paused = true
  })
  readonly load = vi.fn()
  readonly removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = ''
  })
  readonly play = vi.fn(async () => {
    if (MockHTMLAudioElement.rejectNextPlay) {
      MockHTMLAudioElement.rejectNextPlay = false
      throw new Error('network unavailable')
    }
    this.paused = false
  })

  constructor() {
    MockHTMLAudioElement.instances.push(this)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener)
  }

  emitError(): void {
    const event = new Event('error')
    this.listeners.get('error')?.forEach((listener) => {
      if (typeof listener === 'function') listener(event)
      else listener.handleEvent(event)
    })
  }
}

class MockGainNode extends MockAudioNode {
  readonly gain = new MockAudioParam()
}

class MockBiquadFilterNode extends MockAudioNode {
  type: BiquadFilterType = 'lowpass'
  readonly frequency = new MockAudioParam()
  readonly Q = new MockAudioParam()
}

class MockStereoPannerNode extends MockAudioNode {
  readonly pan = new MockAudioParam()
}

class MockOscillatorNode extends MockAudioNode {
  type: OscillatorType = 'sine'
  readonly frequency = new MockAudioParam()
  readonly detune = new MockAudioParam()
  started = false
  stopped = false

  start(_when?: number): void {
    this.started = true
  }

  stop(_when?: number): void {
    this.stopped = true
  }
}

class MockCompressorNode extends MockAudioNode {
  readonly threshold = new MockAudioParam()
  readonly knee = new MockAudioParam()
  readonly ratio = new MockAudioParam()
  readonly attack = new MockAudioParam()
  readonly release = new MockAudioParam()
}

class MockAudioContext {
  static readonly instances: MockAudioContext[] = []

  state: AudioContextState = 'suspended'
  currentTime = 10
  readonly destination = new MockAudioNode()
  readonly gains: MockGainNode[] = []
  readonly filters: MockBiquadFilterNode[] = []
  readonly mediaSources: MockMediaElementAudioSourceNode[] = []
  readonly oscillators: MockOscillatorNode[] = []
  readonly audioWorklet = { addModule: vi.fn(async (_url: string) => undefined) }

  constructor(_options?: AudioContextOptions) {
    MockAudioContext.instances.push(this)
  }

  createGain(): MockGainNode {
    const node = new MockGainNode()
    this.gains.push(node)
    return node
  }

  createDynamicsCompressor(): MockCompressorNode {
    return new MockCompressorNode()
  }

  createBiquadFilter(): MockBiquadFilterNode {
    const node = new MockBiquadFilterNode()
    this.filters.push(node)
    return node
  }

  createMediaElementSource(element: MockHTMLAudioElement): MockMediaElementAudioSourceNode {
    const node = new MockMediaElementAudioSourceNode(element)
    this.mediaSources.push(node)
    return node
  }

  createStereoPanner(): MockStereoPannerNode {
    return new MockStereoPannerNode()
  }

  createOscillator(): MockOscillatorNode {
    const node = new MockOscillatorNode()
    this.oscillators.push(node)
    return node
  }

  async resume(): Promise<void> {
    this.state = 'running'
  }

  async suspend(): Promise<void> {
    this.state = 'suspended'
  }

  async close(): Promise<void> {
    this.state = 'closed'
  }
}

interface ProcessorOptionsSnapshot {
  processorOptions?: {
    brownGain?: number
    rainDensity?: number
  }
}

class MockAudioWorkletNode extends MockAudioNode {
  static readonly instances: MockAudioWorkletNode[] = []

  onprocessorerror: ((event: Event) => void) | null = null

  constructor(
    readonly context: MockAudioContext,
    readonly name: string,
    readonly options: ProcessorOptionsSnapshot,
  ) {
    super()
    MockAudioWorkletNode.instances.push(this)
  }

  emitProcessorError(): void {
    this.onprocessorerror?.(new Event('processorerror'))
  }
}

async function flushOperations(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('FocusAudioEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockAudioContext.instances.length = 0
    MockAudioWorkletNode.instances.length = 0
    MockHTMLAudioElement.instances.length = 0
    MockHTMLAudioElement.rejectNextPlay = false
    vi.stubGlobal('AudioContext', MockAudioContext)
    vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode)
    vi.stubGlobal('Audio', MockHTMLAudioElement)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('prepares exactly one context and clamps the public volume safely', async () => {
    const engine = new FocusAudioEngine()

    await engine.prepare()
    await engine.prepare()
    await engine.start('deep-work', 'standard', 2)

    expect(MockAudioContext.instances).toHaveLength(1)
    expect(MockAudioContext.instances[0].audioWorklet.addModule).toHaveBeenCalledTimes(1)
    expect(MockAudioWorkletNode.instances).toHaveLength(1)
    expect(engine.getState()).toMatchObject({ isReady: true, isPlaying: true, volume: 1 })

    engine.setVolume(Number.NaN)
    expect(engine.getState().volume).toBe(0)

    const dispose = engine.dispose()
    await vi.advanceTimersByTimeAsync(300)
    await dispose
  })

  it('streams a same-origin recorded loop through the existing safe output graph', async () => {
    const engine = new FocusAudioEngine()

    await engine.prepare()
    await engine.start('rain-light', 'strong', 2)

    const context = MockAudioContext.instances[0]
    const media = MockHTMLAudioElement.instances[0]
    expect(MockAudioContext.instances).toHaveLength(1)
    expect(MockAudioWorkletNode.instances).toHaveLength(0)
    expect(context.mediaSources).toHaveLength(1)
    expect(media).toMatchObject({
      autoplay: false,
      loop: true,
      paused: false,
      preload: 'metadata',
      src: '/audio/ambient/rain-light.ogg',
      volume: 1,
    })
    expect(media.play).toHaveBeenCalledTimes(1)
    expect(context.filters[0].frequency.value).toBe(10_000)
    expect(context.gains[1].gain.value).toBeLessThanOrEqual(0.68)
    expect(context.gains[0].gain.ramps.at(-1)?.target).toBe(0.72)

    const dispose = engine.dispose()
    await vi.advanceTimersByTimeAsync(300)
    await dispose
    expect(media.pause).toHaveBeenCalled()
    expect(media.load).toHaveBeenCalledTimes(1)
    expect(context.mediaSources[0].disconnected).toBe(true)
  })

  it('updates recorded intensity in place without restarting or rebuilding media', async () => {
    const engine = new FocusAudioEngine()
    await engine.start('rain-soft', 'standard', 0.6)

    const context = MockAudioContext.instances[0]
    const media = MockHTMLAudioElement.instances[0]
    await engine.setIntensity('strong')

    expect(MockHTMLAudioElement.instances).toHaveLength(1)
    expect(context.mediaSources).toHaveLength(1)
    expect(media.play).toHaveBeenCalledTimes(1)
    expect(context.filters[0].frequency.ramps.at(-1)?.target).toBe(10_000)
    expect(context.gains[1].gain.ramps.at(-1)?.target).toBe(0.68)
    expect(engine.getState().intensity).toBe('strong')

    const dispose = engine.dispose()
    await vi.advanceTimersByTimeAsync(300)
    await dispose
  })

  it('crossfades from recorded audio and releases the retired media after two seconds', async () => {
    const engine = new FocusAudioEngine()
    await engine.start('forest-ambience', 'standard', 0.6)

    const context = MockAudioContext.instances[0]
    const media = MockHTMLAudioElement.instances[0]
    const sourceNode = context.mediaSources[0]
    await engine.setPreset('deep-work', 'standard')

    expect(MockAudioContext.instances).toHaveLength(1)
    expect(MockAudioWorkletNode.instances).toHaveLength(1)
    expect(media.pause).not.toHaveBeenCalled()
    expect(sourceNode.disconnected).toBe(false)

    await vi.advanceTimersByTimeAsync(2_100)
    expect(media.pause).toHaveBeenCalled()
    expect(media.src).toBe('')
    expect(media.load).toHaveBeenCalledTimes(1)
    expect(sourceNode.disconnected).toBe(true)
    expect(engine.getState()).toMatchObject({ preset: 'deep-work', isPlaying: true })

    const dispose = engine.dispose()
    await vi.advanceTimersByTimeAsync(300)
    await dispose
  })

  it('keeps the existing sound when a newly selected recording cannot start', async () => {
    const engine = new FocusAudioEngine()
    await engine.start('deep-work', 'standard', 0.6)
    const existingProcessor = MockAudioWorkletNode.instances[0]
    MockHTMLAudioElement.rejectNextPlay = true

    await expect(engine.setPreset('rain-light', 'standard')).rejects.toThrow(
      /could not start.*network unavailable/i,
    )

    const failedMedia = MockHTMLAudioElement.instances[0]
    expect(MockAudioContext.instances).toHaveLength(1)
    expect(existingProcessor.disconnected).toBe(false)
    expect(failedMedia.pause).toHaveBeenCalled()
    expect(failedMedia.src).toBe('')
    expect(engine.getState()).toMatchObject({
      preset: 'deep-work',
      intensity: 'standard',
      isPlaying: true,
    })

    const dispose = engine.dispose()
    await vi.advanceTimersByTimeAsync(300)
    await dispose
  })

  it('returns to the fading sound if a new recording errors during its crossfade', async () => {
    const engine = new FocusAudioEngine()
    await engine.start('deep-work', 'standard', 0.6)
    const existingProcessor = MockAudioWorkletNode.instances[0]
    await engine.setPreset('rain-full', 'standard')

    const failedMedia = MockHTMLAudioElement.instances[0]
    failedMedia.emitError()
    await flushOperations()

    expect(existingProcessor.disconnected).toBe(false)
    expect(engine.getState()).toMatchObject({ preset: 'deep-work', isPlaying: true })
    await vi.advanceTimersByTimeAsync(300)
    expect(failedMedia.pause).toHaveBeenCalled()
    expect(failedMedia.src).toBe('')

    const dispose = engine.dispose()
    await vi.advanceTimersByTimeAsync(300)
    await dispose
  })

  it('pauses, resumes, stops, and disposes recorded media cleanly', async () => {
    const engine = new FocusAudioEngine()
    await engine.start('fireplace', 'soft', 0.6)
    const context = MockAudioContext.instances[0]
    const media = MockHTMLAudioElement.instances[0]

    const pause = engine.pause()
    await vi.advanceTimersByTimeAsync(300)
    await pause
    expect(media.pause).toHaveBeenCalledTimes(1)
    expect(context.state).toBe('suspended')

    await engine.resume()
    expect(media.play).toHaveBeenCalledTimes(2)
    expect(context.state).toBe('running')

    const stop = engine.stop()
    await vi.advanceTimersByTimeAsync(300)
    await stop
    expect(media.pause.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(media.load).toHaveBeenCalledTimes(1)
    expect(context.mediaSources[0].disconnected).toBe(true)
    expect(context.state).toBe('suspended')

    await engine.dispose()
    expect(context.state).toBe('closed')
  })

  it('crossfades deterministic profiles and disposes the retired deck', async () => {
    const engine = new FocusAudioEngine()
    await engine.start('deep-work', 'soft', 0.6)
    const firstProcessor = MockAudioWorkletNode.instances[0]

    await engine.setPreset('flow', 'strong')

    expect(MockAudioWorkletNode.instances).toHaveLength(2)
    expect(MockAudioWorkletNode.instances[1].options.processorOptions?.rainDensity).toBeGreaterThan(
      firstProcessor.options.processorOptions?.rainDensity ?? 0,
    )
    expect(firstProcessor.disconnected).toBe(false)

    await vi.advanceTimersByTimeAsync(2_100)
    expect(firstProcessor.disconnected).toBe(true)
    expect(engine.getState()).toMatchObject({ preset: 'flow', intensity: 'strong' })

    const dispose = engine.dispose()
    await vi.advanceTimersByTimeAsync(300)
    await dispose
  })

  it('fades around pause, resume, stop, and final disposal', async () => {
    const engine = new FocusAudioEngine()
    await engine.start('calm-focus', 'standard', 0.5)
    const context = MockAudioContext.instances[0]

    const pause = engine.pause()
    await vi.advanceTimersByTimeAsync(300)
    await pause
    expect(context.state).toBe('suspended')
    expect(engine.getState().isPlaying).toBe(false)

    await engine.resume()
    expect(context.state).toBe('running')
    expect(engine.getState().isPlaying).toBe(true)

    const stop = engine.stop()
    await vi.advanceTimersByTimeAsync(300)
    await stop
    expect(context.state).toBe('suspended')
    expect(MockAudioWorkletNode.instances[0].disconnected).toBe(true)
    expect(context.oscillators.every((oscillator) => oscillator.stopped)).toBe(true)

    await engine.dispose()
    expect(context.state).toBe('closed')
    expect(engine.getState()).toMatchObject({ isReady: false, isPlaying: false })
  })

  it('rebuilds once after processor failure and then fails closed', async () => {
    const onFatalError = vi.fn()
    const engine = new FocusAudioEngine({ onFatalError })
    await engine.start('deep-work', 'standard', 0.6)

    MockAudioWorkletNode.instances[0].emitProcessorError()
    await flushOperations()
    expect(MockAudioWorkletNode.instances).toHaveLength(2)

    MockAudioWorkletNode.instances[1].emitProcessorError()
    await flushOperations()
    expect(MockAudioWorkletNode.instances).toHaveLength(2)
    expect(engine.getState().isPlaying).toBe(false)
    expect(onFatalError).toHaveBeenCalledTimes(1)
    expect(onFatalError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringMatching(/automatic recovery failed/i),
    }))

    const failedProcessor = MockAudioWorkletNode.instances[1]
    await engine.stop()
    expect(failedProcessor.disconnected).toBe(true)
    expect(MockAudioContext.instances[0].oscillators.every((oscillator) => oscillator.stopped)).toBe(true)
    expect(MockAudioContext.instances[0].state).toBe('suspended')

    await vi.advanceTimersByTimeAsync(2_100)
    await engine.dispose()
  })

  it('plays a gentle completion chime and returns an idle context to suspension', async () => {
    const engine = new FocusAudioEngine()

    const chime = engine.playCompletionChime()
    await flushOperations()
    await vi.advanceTimersByTimeAsync(1_200)
    await chime

    const context = MockAudioContext.instances[0]
    expect(context.oscillators).toHaveLength(2)
    expect(context.oscillators.every((oscillator) => oscillator.stopped)).toBe(true)
    expect(context.state).toBe('suspended')

    await engine.dispose()
  })

  it('uses the latest preset when rapid intensity changes are queued', async () => {
    const engine = new FocusAudioEngine()
    await engine.start('deep-work', 'standard', 0.6)

    const presetChange = engine.setPreset('flow', 'standard')
    const intensityChange = engine.setIntensity('strong')
    await Promise.all([presetChange, intensityChange])

    expect(engine.getState()).toMatchObject({ preset: 'flow', intensity: 'strong' })
    expect(MockAudioWorkletNode.instances.at(-1)?.options.processorOptions?.brownGain).toBe(
      0.0944,
    )

    const dispose = engine.dispose()
    await vi.advanceTimersByTimeAsync(300)
    await dispose
  })
})
