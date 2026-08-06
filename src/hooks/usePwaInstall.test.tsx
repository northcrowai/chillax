import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePwaInstall } from './usePwaInstall'

function InstallHarness() {
  const installState = usePwaInstall()

  return (
    <button
      disabled={!installState.canInstall}
      onClick={() => void installState.install()}
      type="button"
    >
      {installState.canInstall ? 'Install available' : 'Install unavailable'}
    </button>
  )
}

const dispatchInstallPrompt = (
  prompt: () => Promise<void>,
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>,
) => {
  const event = Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice })
  window.dispatchEvent(event)
}

describe('usePwaInstall', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('consumes a dismissed browser prompt so it cannot be reused', async () => {
    const prompt = vi.fn(async () => undefined)
    render(<InstallHarness />)

    dispatchInstallPrompt(prompt, Promise.resolve({ outcome: 'dismissed', platform: 'web' }))
    const installButton = await screen.findByRole('button', { name: 'Install available' })
    fireEvent.click(installButton)

    await waitFor(() => {
      expect(prompt).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: 'Install unavailable' })).toBeDisabled()
    })
  })

  it('clears a prompt that rejects instead of leaving a broken install button', async () => {
    const prompt = vi.fn(async () => {
      throw new Error('Prompt expired')
    })
    render(<InstallHarness />)

    dispatchInstallPrompt(prompt, new Promise(() => undefined))
    fireEvent.click(await screen.findByRole('button', { name: 'Install available' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Install unavailable' })).toBeDisabled()
    })
  })
})
