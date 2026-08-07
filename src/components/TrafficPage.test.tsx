import { act, fireEvent, render, screen, within } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LeaveByClock } from './LeaveByClock'
import { TrafficPage } from './TrafficPage'
import type { TrafficPlanView } from './TrafficPage'

const routePlan: TrafficPlanView = {
  durationSeconds: 32 * 60,
  fetchedAt: '2099-08-06T16:00:00',
  leaveBy: '2099-08-06T16:15:00',
  leaveNow: false,
  predictedArrivalTime: '2099-08-06T16:47:00',
  staticDurationSeconds: 25 * 60,
}

const makeProps = (overrides: Partial<Parameters<typeof TrafficPage>[0]> = {}) => ({
  arrivalTime: '17:00',
  configurationMissing: false,
  cushionMinutes: 5 as const,
  errorMessage: null,
  homeAddress: '100 Sample Street',
  isAudioBusy: false,
  manualOrigin: 'Downtown library',
  mapUrl: 'https://maps.googleapis.com/maps/api/staticmap?mock=true',
  needsManualOrigin: false,
  onArrivalTimeChange: vi.fn(),
  onCalculate: vi.fn(),
  onCushionMinutesChange: vi.fn(),
  onHomeAddressChange: vi.fn(),
  onManualOriginChange: vi.fn(),
  onReturnToFocus: vi.fn(),
  onTogglePlayback: vi.fn(),
  plan: routePlan,
  playbackSessionName: 'focus session',
  presetName: 'Night Notes',
  sessionLabel: 'Infinite session',
  status: 'ready' as const,
  timerDisplay: '12:34',
  timerStatus: 'running' as const,
  ...overrides,
})

describe('TrafficPage', () => {
  it('shows a live route, Google attribution, and the uninterrupted Chillax session', () => {
    render(<TrafficPage {...makeProps()} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Get home on time.' })).toBeInTheDocument()
    expect(screen.getByLabelText('Home')).toHaveValue('100 Sample Street')
    expect(screen.getByLabelText('Be home by')).toHaveValue('17:00')
    expect(screen.getByRole('button', { name: 'Current location' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '5 minute arrival cushion' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const results = screen.getByRole('region', { name: 'Your leave time' })
    expect(within(results).getByText('4:15 PM')).toBeInTheDocument()
    expect(within(results).getByText('32 min')).toBeInTheDocument()
    expect(within(results).getByText('+7 min')).toBeInTheDocument()
    expect(within(results).getByText('4:47 PM')).toBeInTheDocument()

    const map = screen.getByRole('img', {
      name: 'Google Maps route from your starting point to home',
    })
    expect(map).toHaveAttribute('src', expect.stringContaining('maps.googleapis.com'))
    expect(map).toHaveAttribute('referrerpolicy', 'origin')
    expect(screen.getByRole('link', { name: 'Google Maps' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps',
    )

    expect(screen.getByLabelText('12:34 on the Chillax timer')).toBeInTheDocument()
    expect(screen.getByText('Night Notes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause focus session' })).toBeInTheDocument()
  })

  it('collects editable route settings and submits the chosen manual origin', () => {
    const props = makeProps({ mapUrl: null, plan: null, status: 'idle' })
    render(<TrafficPage {...props} />)

    fireEvent.input(screen.getByLabelText('Home'), {
      target: { value: '200 Example Avenue' },
    })
    fireEvent.input(screen.getByLabelText('Be home by'), {
      target: { value: '18:20' },
    })
    fireEvent.click(screen.getByRole('button', { name: '10 minute arrival cushion' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enter a location' }))
    fireEvent.input(screen.getByLabelText('Where are you leaving from?'), {
      target: { value: 'Community center' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Calculate leave time' }))

    expect(props.onHomeAddressChange).toHaveBeenCalledWith('200 Example Avenue')
    expect(props.onArrivalTimeChange).toHaveBeenCalledWith('18:20')
    expect(props.onCushionMinutesChange).toHaveBeenCalledWith(10)
    expect(props.onManualOriginChange).toHaveBeenCalledWith('Community center')
    expect(props.onCalculate).toHaveBeenCalledWith({ useManualOrigin: true })
  })

  it('opens the manual fallback when current location is unavailable', () => {
    const props = makeProps({
      errorMessage: 'Location access was blocked. Enter a starting point instead.',
      mapUrl: null,
      needsManualOrigin: true,
      plan: null,
      status: 'error',
    })
    render(<TrafficPage {...props} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Location access was blocked')
    expect(screen.getByLabelText('Where are you leaving from?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enter a location' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('renders loading and missing-configuration states without hiding the session', () => {
    const { rerender } = render(<TrafficPage {...makeProps({
      configurationMessage: 'Add restricted Google browser keys to enable Traffic.',
      configurationMissing: true,
      mapUrl: null,
      plan: null,
      status: 'idle',
    })} />)

    expect(screen.getByText('Traffic setup needed')).toBeInTheDocument()
    expect(screen.getByText('Add restricted Google browser keys to enable Traffic.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calculate leave time' })).toBeDisabled()
    expect(screen.getByLabelText('12:34 on the Chillax timer')).toBeInTheDocument()

    rerender(<TrafficPage {...makeProps({
      mapUrl: null,
      plan: null,
      status: 'loading',
    })} />)
    expect(screen.getAllByText('Checking traffic...').length).toBeGreaterThan(0)
    expect(screen.getByText('Chillax is finding the best time to leave.')).toBeInTheDocument()
  })

  it('exposes playback and focus-return actions without owning session state', () => {
    const props = makeProps()
    render(<TrafficPage {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Pause focus session' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to focus' }))

    expect(props.onTogglePlayback).toHaveBeenCalledTimes(1)
    expect(props.onReturnToFocus).toHaveBeenCalledTimes(1)
  })
})

describe('LeaveByClock', () => {
  afterEach(() => vi.useRealTimers())

  it('stays hidden until a route exists and announces the leave time compactly', () => {
    const { container, rerender } = render(<LeaveByClock departureTime={null} />)
    expect(container).toBeEmptyDOMElement()

    rerender(<LeaveByClock departureTime="2099-08-06T16:15:00" />)
    expect(screen.getByRole('status', {
      name: 'Traffic reminder: leave by 4:15 PM',
    })).toBeInTheDocument()
    expect(screen.getByText('4:15 PM')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Google Maps' })).not.toBeInTheDocument()

    rerender(<LeaveByClock departureTime="2099-08-06T16:15:00" leaveNow />)
    expect(screen.getByRole('status', {
      name: 'Traffic reminder: leave now',
    })).toBeInTheDocument()
    expect(screen.getByText('Now')).toBeInTheDocument()
  })

  it('changes to leave now and disappears after the arrival target', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2099-08-06T16:14:00'))
    const { container } = render(
      <LeaveByClock
        departureTime="2099-08-06T16:15:00"
        expiresAt="2099-08-06T17:00:00"
      />,
    )

    expect(screen.getByText('4:15 PM')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000)
    })
    expect(screen.getByText('Now')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(45 * 60 * 1000)
    })
    expect(container).toBeEmptyDOMElement()
  })
})
