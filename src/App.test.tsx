import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { STORAGE_KEY } from './lib/storage'

const audioMocks = vi.hoisted(() => ({
  clearError: vi.fn(),
  pause: vi.fn(async () => true),
  playCompletionChime: vi.fn(async () => true),
  setIntensity: vi.fn(async () => true),
  setPreset: vi.fn(async () => true),
  setVolume: vi.fn(),
  start: vi.fn(async () => true),
  stop: vi.fn(async () => true),
}))
const audioHookState = vi.hoisted(() => ({ fatalErrorVersion: 0 }))

vi.mock('./hooks/useFocusAudio', () => ({
  useFocusAudio: () => ({
    state: {
      isReady: false,
      isPlaying: false,
      preset: 'deep-work',
      intensity: 'standard',
      volume: 0.55,
    },
    isBusy: false,
    error: null,
    fatalErrorVersion: audioHookState.fatalErrorVersion,
    ...audioMocks,
  }),
}))

vi.mock('./pwa', () => ({
  isChillaxOfflineReady: vi.fn(async () => false),
  registerChillaxServiceWorker: () => vi.fn(async () => undefined),
}))

describe('Chillax app', () => {
  beforeEach(() => {
    window.localStorage.clear()
    audioHookState.fatalErrorVersion = 0
    vi.clearAllMocks()
  })

  it('renders the default focus experience', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Find your quiet.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start focus session' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Deep Work/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Standard: Balanced/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('50:00 remaining')).toBeInTheDocument()
  })

  it('changes and persists the selected soundscape, texture, and duration', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Flow/ }))
    fireEvent.click(screen.getByRole('button', { name: /Strong: Fuller/ }))
    fireEvent.click(screen.getByRole('button', { name: /25 min/ }))

    expect(screen.getByRole('button', { name: /Flow/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Strong: Fuller/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('25:00 remaining')).toBeInTheDocument()
    expect(audioMocks.setPreset).toHaveBeenCalledWith('flow', 'standard')
    expect(audioMocks.setIntensity).toHaveBeenCalledWith('strong')

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
      expect(saved.preferences).toMatchObject({
        preset: 'flow',
        intensity: 'strong',
        durationMinutes: 25,
      })
    })
  })

  it('starts, pauses, and resets a focus session only after interaction', async () => {
    render(<App />)

    const startButton = screen.getByRole('button', { name: 'Start focus session' })
    fireEvent.click(startButton)
    fireEvent.click(startButton)
    await waitFor(() => expect(audioMocks.start).toHaveBeenCalledWith('deep-work', 'standard', 0.55))
    expect(audioMocks.start).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Pause focus session' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pause focus session' }))
    await waitFor(() => expect(audioMocks.pause).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Resume focus session' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset focus session' }))
    expect(audioMocks.stop).toHaveBeenCalled()
    expect(screen.getByLabelText('50:00 remaining')).toBeInTheDocument()
  })

  it('supports custom duration, volume, mute, and keyboard controls', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    const minutesInput = screen.getByRole('spinbutton', { name: /Minutes/ })
    fireEvent.input(minutesInput, { target: { value: '1' } })
    expect(minutesInput).toHaveValue(1)
    fireEvent.input(minutesInput, { target: { value: '12' } })
    expect(minutesInput).toHaveValue(12)
    fireEvent.input(minutesInput, { target: { value: '120' } })
    expect(minutesInput).toHaveValue(120)
    fireEvent.blur(minutesInput)
    expect(screen.getByLabelText('02:00:00 remaining')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mute soundscape' }))
    expect(audioMocks.setVolume).toHaveBeenLastCalledWith(0)

    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    await waitFor(() => expect(audioMocks.start).toHaveBeenCalled())
  })

  it('handles each fatal audio error once and allows a later resume', async () => {
    const view = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Start focus session' }))
    await screen.findByRole('button', { name: 'Pause focus session' })

    audioHookState.fatalErrorVersion = 1
    view.rerender(<App />)
    await screen.findByRole('button', { name: 'Resume focus session' })

    fireEvent.click(screen.getByRole('button', { name: 'Resume focus session' }))
    await screen.findByRole('button', { name: 'Pause focus session' })
  })

  it('uses one accessible duration label and omits progress in endless mode', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: '25 min' })).toHaveTextContent('25')
    fireEvent.click(screen.getByRole('button', { name: 'Endless' }))
    expect(screen.getByLabelText('00:00 elapsed')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('opens settings and restores defaults', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Flow/ }))
    const settingsButton = screen.getByRole('button', { name: 'Open settings' })
    fireEvent.click(settingsButton)
    expect(screen.getByRole('dialog', { name: 'Keep it simple.' })).toBeInTheDocument()
    expect(screen.getByText(/no account, analytics, or remote data storage/i)).toBeInTheDocument()

    const closeButton = within(screen.getByRole('dialog')).getByRole('button', { name: 'Close settings' })
    const resetButton = screen.getByRole('button', { name: 'Restore default settings' })
    expect(closeButton).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(resetButton).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(closeButton).toHaveFocus()

    fireEvent.click(resetButton)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Deep Work/ })).toHaveAttribute('aria-pressed', 'true')
    expect(audioMocks.stop).toHaveBeenCalled()
    await waitFor(() => expect(settingsButton).toHaveFocus())

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
      expect(saved.preferences.preset).toBe('deep-work')
    })
  })
})
