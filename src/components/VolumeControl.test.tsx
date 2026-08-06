import { fireEvent, render, screen } from '@testing-library/preact'
import { describe, expect, it, vi } from 'vitest'
import { VolumeControl } from './VolumeControl'

describe('VolumeControl', () => {
  it('exposes the full 0 to 100 percent range without a dead zone', () => {
    const onChange = vi.fn()

    render(
      <VolumeControl
        onChange={onChange}
        onToggleMute={vi.fn()}
        value={1}
      />,
    )

    const slider = screen.getByRole('slider', { name: 'Soundscape volume' })
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '1')
    expect(slider).toHaveAttribute('step', '0.01')
    expect(screen.getByLabelText('Volume 100 percent')).toHaveTextContent('100')

    fireEvent.input(slider, { target: { value: '0.76' } })
    fireEvent.input(slider, { target: { value: '1' } })

    expect(onChange).toHaveBeenNthCalledWith(1, 0.76)
    expect(onChange).toHaveBeenNthCalledWith(2, 1)
  })
})
