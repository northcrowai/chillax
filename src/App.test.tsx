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

  it('renders the clean 60-minute default experience', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Find your quiet.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start focus session' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Deep Work/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Standard: Balanced/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '60 minutes' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('60:00 remaining')).toBeInTheDocument()
    expect(screen.getByText('One uninterrupted hour')).toBeInTheDocument()
  })

  it('changes and persists the selected soundscape, texture, and session', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Flow State:/ }))
    fireEvent.click(screen.getByRole('button', { name: /Strong: Fuller/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Infinite' }))

    expect(screen.getByRole('button', { name: /Flow State:/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Strong: Fuller/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('00:00 elapsed')).toBeInTheDocument()
    expect(audioMocks.setPreset).toHaveBeenCalledWith('flow', 'standard')
    expect(audioMocks.setIntensity).toHaveBeenCalledWith('strong')

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
      expect(saved.preferences).toMatchObject({
        preset: 'flow',
        intensity: 'strong',
        durationMinutes: null,
      })
      expect(saved.sessionPlan).toMatchObject({ choice: 'endless' })
    })
  })

  it('offers recorded nature and lo-fi loops and switches themes', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('tab', { name: /Nature/ }))
    fireEvent.click(screen.getByRole('button', { name: /Fireside:/ }))
    expect(screen.getByRole('button', { name: /Fireside:/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Streamed on demand')).toBeInTheDocument()
    expect(audioMocks.setPreset).toHaveBeenCalledWith('fireplace', 'standard')

    fireEvent.click(screen.getByRole('tab', { name: /Lo-fi/ }))
    fireEvent.click(screen.getByRole('button', { name: /Soft Study:/ }))
    expect(screen.getByRole('button', { name: /Soft Study:/ })).toHaveAttribute('aria-pressed', 'true')
    expect(audioMocks.setPreset).toHaveBeenCalledWith('lofi-soft-study', 'standard')

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
      expect(saved.preferences).toMatchObject({ preset: 'lofi-soft-study', theme: 'dark' })
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
    expect(screen.getByLabelText('60:00 remaining')).toBeInTheDocument()
  })

  it('applies a custom one-off duration and supports volume and keyboard controls', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    const dialog = screen.getByRole('dialog', { name: 'Set your rhythm.' })
    const minutesInput = within(dialog).getByRole('spinbutton', { name: /Session length/ })
    fireEvent.input(minutesInput, { target: { value: '120' } })
    expect(minutesInput).toHaveValue(120)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use this session' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('120:00 remaining')).toBeInTheDocument()
    expect(screen.getByText('120 minute custom session')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mute soundscape' }))
    expect(audioMocks.setVolume).toHaveBeenLastCalledWith(0)

    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    await waitFor(() => expect(audioMocks.start).toHaveBeenCalled())
  })

  it('configures and persists a Pomodoro cycle', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    const dialog = screen.getByRole('dialog', { name: 'Set your rhythm.' })
    fireEvent.click(within(dialog).getByRole('button', { name: /Pomodoro/ }))
    fireEvent.input(within(dialog).getByRole('spinbutton', { name: /Focus session/ }), {
      target: { value: '30' },
    })
    fireEvent.input(within(dialog).getByRole('spinbutton', { name: /Short break/ }), {
      target: { value: '7' },
    })
    fireEvent.input(within(dialog).getByRole('spinbutton', { name: /^Long breakminutes$/ }), {
      target: { value: '20' },
    })
    fireEvent.input(within(dialog).getByRole('spinbutton', { name: /Long break after/ }), {
      target: { value: '3' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use this session' }))

    expect(screen.getByLabelText('30:00 remaining')).toBeInTheDocument()
    expect(screen.getByText('Focus 1 of 3')).toBeInTheDocument()
    expect(screen.getByText('Focus session ready')).toBeInTheDocument()
    expect(screen.getByText('30 focus / 7 short / 20 long / every 3')).toBeInTheDocument()

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
      expect(saved.sessionPlan).toMatchObject({ choice: 'custom', customMode: 'pomodoro' })
      expect(saved.pomodoro.config).toEqual({
        workMinutes: 30,
        shortBreakMinutes: 7,
        longBreakMinutes: 20,
        focusSessionsBeforeLongBreak: 3,
      })
    })
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

  it('uses complete session labels and omits progress in infinite mode', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: '60 minutes' })).toHaveTextContent('60 minutes')
    expect(screen.getByRole('button', { name: 'Custom' })).toHaveTextContent('Custom')
    fireEvent.click(screen.getByRole('button', { name: 'Infinite' }))
    expect(screen.getByLabelText('00:00 elapsed')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('opens settings and restores defaults', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Flow State:/ }))
    const settingsButton = screen.getByRole('button', { name: 'Open settings' })
    fireEvent.click(settingsButton)
    expect(screen.getByRole('dialog', { name: 'Make it yours.' })).toBeInTheDocument()
    expect(screen.getByText(/no account, analytics, cookies/i)).toBeInTheDocument()

    const closeButton = within(screen.getByRole('dialog')).getByRole('button', { name: 'Close settings' })
    const resetButton = screen.getByRole('button', { name: 'Restore default settings' })
    expect(closeButton).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(resetButton).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(closeButton).toHaveFocus()

    fireEvent.click(resetButton)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Deep Work:/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '60 minutes' })).toHaveAttribute('aria-pressed', 'true')
    expect(audioMocks.stop).toHaveBeenCalled()
    await waitFor(() => expect(settingsButton).toHaveFocus())

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
      expect(saved.preferences.preset).toBe('deep-work')
      expect(saved.sessionPlan.choice).toBe('sixty')
    })
  })
})
