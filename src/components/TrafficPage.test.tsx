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
  configurationMissing: false,
  cushionMinutes: 5 as const,
  drive: {
    dayLabel: 'Today',
    routeLabel: 'Work to Home',
    arrivalLabel: 'Arrive home',
    desiredArrival: new Date('2099-08-06T17:00:00'),
  },
  errorMessage: null,
  homeAddress: '100 Sample Street',
  homeArrivalTime: '17:00',
  isAudioBusy: false,
  mapUrl: 'https://maps.googleapis.com/maps/api/staticmap?mock=true',
  onCalculate: vi.fn(),
  onCushionMinutesChange: vi.fn(),
  onHomeAddressChange: vi.fn(),
  onHomeArrivalTimeChange: vi.fn(),
  onReturnToFocus: vi.fn(),
  onTogglePlayback: vi.fn(),
  onWorkAddressChange: vi.fn(),
  onWorkArrivalTimeChange: vi.fn(),
  plan: routePlan,
  playbackSessionName: 'focus session',
  presetName: 'Night Notes',
  sessionLabel: 'Infinite session',
  status: 'ready' as const,
  timerDisplay: '12:34',
  timerStatus: 'running' as const,
  workAddress: '200 Sample Work Way',
  workArrivalTime: '09:00',
  ...overrides,
})

describe('TrafficPage', () => {
  it('shows the active commute, route, and uninterrupted Chillax session', () => {
    render(<TrafficPage {...makeProps()} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Get there on time.' })).toBeInTheDocument()
    expect(screen.getByLabelText('Home address')).toHaveValue('100 Sample Street')
    expect(screen.getByLabelText('Arrive home by')).toHaveValue('17:00')
    expect(screen.getByLabelText('Work address')).toHaveValue('200 Sample Work Way')
    expect(screen.getByLabelText('Arrive at work by')).toHaveValue('09:00')
    expect(screen.getByText('Today · Work to Home')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '5 minute arrival cushion' })).toHaveAttribute('aria-pressed', 'true')

    const results = screen.getByRole('region', { name: 'Your leave time' })
    expect(within(results).getByText('4:15 PM')).toBeInTheDocument()
    expect(within(results).getByText('32 min')).toBeInTheDocument()
    expect(within(results).getByText('+7 min')).toBeInTheDocument()
    expect(within(results).getByText('4:47 PM')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Google Maps route: Work to Home' })).toHaveAttribute('referrerpolicy', 'origin')
    expect(screen.getByLabelText('12:34 on the Chillax timer')).toBeInTheDocument()
  })

  it('collects the Home and Work schedule and calculates the active commute', () => {
    const props = makeProps({ mapUrl: null, plan: null, status: 'idle' })
    render(<TrafficPage {...props} />)

    fireEvent.input(screen.getByLabelText('Home address'), { target: { value: '200 Example Avenue' } })
    fireEvent.input(screen.getByLabelText('Arrive home by'), { target: { value: '18:20' } })
    fireEvent.input(screen.getByLabelText('Work address'), { target: { value: '300 Work Avenue' } })
    fireEvent.input(screen.getByLabelText('Arrive at work by'), { target: { value: '08:45' } })
    fireEvent.click(screen.getByRole('button', { name: '10 minute arrival cushion' }))
    fireEvent.click(screen.getByRole('button', { name: 'Calculate leave time' }))

    expect(props.onHomeAddressChange).toHaveBeenCalledWith('200 Example Avenue')
    expect(props.onHomeArrivalTimeChange).toHaveBeenCalledWith('18:20')
    expect(props.onWorkAddressChange).toHaveBeenCalledWith('300 Work Avenue')
    expect(props.onWorkArrivalTimeChange).toHaveBeenCalledWith('08:45')
    expect(props.onCushionMinutesChange).toHaveBeenCalledWith(10)
    expect(props.onCalculate).toHaveBeenCalledOnce()
  })

  it('renders missing-configuration and route-error states without hiding the session', () => {
    const { rerender } = render(<TrafficPage {...makeProps({
      configurationMessage: 'Add restricted Google browser keys to enable Traffic.',
      configurationMissing: true,
      mapUrl: null,
      plan: null,
      status: 'idle',
    })} />)
    expect(screen.getByText('Traffic setup needed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calculate leave time' })).toBeDisabled()

    rerender(<TrafficPage {...makeProps({
      errorMessage: 'Google Maps rejected this site’s route permission.',
      mapUrl: null,
      plan: null,
      status: 'error',
    })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Google Maps rejected')
  })
})

describe('LeaveByClock', () => {
  afterEach(() => vi.useRealTimers())

  it('stays hidden until a route exists and announces the leave time compactly', () => {
    const { container, rerender } = render(<LeaveByClock departureTime={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<LeaveByClock departureTime="2099-08-06T16:15:00" />)
    expect(screen.getByRole('status', { name: 'Traffic reminder: leave by 4:15 PM' })).toBeInTheDocument()
  })

  it('changes to leave now and disappears after the arrival target', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2099-08-06T16:14:00'))
    const { container } = render(<LeaveByClock departureTime="2099-08-06T16:15:00" expiresAt="2099-08-06T17:00:00" />)
    act(() => { vi.advanceTimersByTime(2 * 60 * 1000) })
    expect(screen.getByText('Now')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(45 * 60 * 1000) })
    expect(container).toBeEmptyDOMElement()
  })
})
