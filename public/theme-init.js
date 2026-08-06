/* global window, document */

(() => {
  try {
    const state = JSON.parse(window.localStorage.getItem('chillax:v2') || 'null')
    const theme = state?.preferences?.theme
    if (theme !== 'light' && theme !== 'dark') return

    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#16071b' : '#f7f3ed')
  } catch {
    // Invalid or unavailable storage should never prevent the app from loading.
  }
})()
