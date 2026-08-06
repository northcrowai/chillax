import { useCallback, useEffect, useState } from 'preact/hooks'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const isStandaloneMode = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(isStandaloneMode)

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }
    const handleInstalled = () => {
      setPromptEvent(null)
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!promptEvent) return false
    try {
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice
      return choice.outcome === 'accepted'
    } catch {
      return false
    } finally {
      setPromptEvent(null)
    }
  }, [promptEvent])

  return {
    canInstall: promptEvent !== null,
    install,
    isStandalone,
  }
}
