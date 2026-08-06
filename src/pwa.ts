import { registerSW } from 'virtual:pwa-register'

interface PwaCallbacks {
  onNeedRefresh: () => void
  onOfflineReady: () => void
}

export const registerChillaxServiceWorker = ({ onNeedRefresh, onOfflineReady }: PwaCallbacks) =>
  registerSW({
    immediate: true,
    onNeedRefresh,
    onOfflineReady,
    onRegisterError(error) {
      if (import.meta.env.DEV) console.warn('Chillax offline setup was unavailable.', error)
    },
  })

export async function isChillaxOfflineReady(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false

  try {
    const registration = await navigator.serviceWorker.getRegistration()
    return Boolean(navigator.serviceWorker.controller || registration?.active)
  } catch {
    return false
  }
}
