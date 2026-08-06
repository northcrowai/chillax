import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('loads the complete focus player without browser errors', async ({ page }) => {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await expect(page.getByRole('heading', { name: 'Find your quiet.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Chillax home' }).locator('svg')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start focus session' })).toBeEnabled()
  await expect(page.getByLabel('60:00 remaining')).toBeVisible()
  await expect(page.getByRole('button', { name: /Deep Work/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.vite-error-overlay')).toHaveCount(0)
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('plays, changes soundscape, pauses, and remembers choices', async ({ page }) => {
  await page.getByRole('button', { name: /Flow/ }).click()
  await page.getByRole('button', { name: /Strong: Fuller/ }).click()
  const volumeSlider = page.getByRole('slider', { name: 'Soundscape volume' })
  await expect(volumeSlider).toHaveAttribute('max', '1')
  await volumeSlider.fill('1')
  await expect(page.getByLabel('Volume 100 percent')).toBeVisible()
  await page.getByRole('button', { name: 'Custom' }).click()
  const customDialog = page.getByRole('dialog', { name: 'Set your rhythm.' })
  await customDialog.getByRole('spinbutton', { name: /Session length/ }).fill('25')
  await customDialog.getByRole('button', { name: 'Use this session' }).click()
  await page.getByRole('button', { name: 'Start focus session' }).click()

  await expect(page.getByRole('button', { name: 'Pause focus session' })).toBeVisible()
  await page.waitForTimeout(1_200)
  await expect(page.getByLabel(/24:5[89] remaining/)).toBeVisible()
  await page.getByRole('button', { name: 'Pause focus session' }).click()
  await expect(page.getByText('Session paused', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume focus session' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: /Flow/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: /Strong: Fuller/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Volume 100 percent')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Session paused', { exact: true })).toBeVisible()
})

test('supports keyboard playback, mute, settings, and reset', async ({ page }) => {
  await page.locator('body').press('Space')
  await expect(page.getByRole('button', { name: 'Pause focus session' })).toBeVisible()

  await page.locator('body').press('m')
  await expect(page.getByLabel('Volume 0 percent')).toBeVisible()

  await page.getByRole('button', { name: 'Pause focus session' }).click()
  await page.getByRole('button', { name: 'Open settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Make it yours.' })).toBeVisible()
  await expect(page.getByText(/no account, analytics, cookies/i)).toBeVisible()
  await page.getByRole('button', { name: 'Restore default settings' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('60:00 remaining')).toBeVisible()
})

test('ships an installable manifest and works offline after caching', async ({ page, context, request }) => {
  const manifestResponse = await request.get('/manifest.webmanifest')
  expect(manifestResponse.ok()).toBeTruthy()
  const manifest = await manifestResponse.json()
  expect(manifest).toMatchObject({
    name: 'Chillax Focus',
    short_name: 'Chillax',
    display: 'standalone',
  })
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192' }),
    expect.objectContaining({ sizes: '512x512' }),
  ]))

  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable.')
    await navigator.serviceWorker.ready
  })
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Find your quiet.' })).toBeVisible()
  await page.getByRole('button', { name: /Calm Focus/ }).click()
  await page.getByRole('button', { name: 'Start focus session' }).click()
  await expect(page.getByRole('button', { name: 'Pause focus session' })).toBeVisible()
  await page.getByRole('button', { name: /Flow/ }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Pause focus session' }).click()
  await context.setOffline(false)
})

test('keeps settings keyboard-contained and scrollable on a short screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 400 })
  const settingsButton = page.getByRole('button', { name: 'Open settings' })
  await settingsButton.click()

  const dialog = page.getByRole('dialog', { name: 'Make it yours.' })
  await expect(dialog).toBeVisible()
  const bounds = await dialog.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(400)

  const closeButton = dialog.getByRole('button', { name: 'Close settings' })
  const resetButton = dialog.getByRole('button', { name: 'Restore default settings' })
  await expect(closeButton).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(resetButton).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(closeButton).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(settingsButton).toBeFocused()
})

test('streams recorded loops on demand and crossfades without stopping the timer', async ({ page }) => {
  await page.getByRole('tab', { name: /Nature/ }).click()
  await page.getByRole('button', { name: /Fireside:/ }).click()

  const fireplaceResponse = page.waitForResponse((response) =>
    response.url().endsWith('/audio/ambient/fireplace.ogg'),
  )
  await page.getByRole('button', { name: 'Start focus session' }).click()
  expect([200, 206]).toContain((await fireplaceResponse).status())
  await expect(page.getByText('Streamed on demand', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause focus session' })).toBeVisible()

  const rainResponse = page.waitForResponse((response) =>
    response.url().endsWith('/audio/ambient/rain-light.ogg'),
  )
  await page.getByRole('button', { name: /Light Rain:/ }).click()
  expect([200, 206]).toContain((await rainResponse).status())
  await expect(page).toHaveTitle(/Light Rain · 60 minute session · Chillax/)
  await expect(page.getByText('Focus session in progress', { exact: true })).toBeVisible()

  await page.getByRole('tab', { name: /Lo-fi/ }).click()
  const lofiResponse = page.waitForResponse((response) =>
    response.url().endsWith('/audio/lofi/soft-study.ogg'),
  )
  await page.getByRole('button', { name: /Soft Study:/ }).click()
  expect([200, 206]).toContain((await lofiResponse).status())
  await expect(page).toHaveTitle(/Soft Study · 60 minute session · Chillax/)

  const cafeResponse = page.waitForResponse((response) =>
    response.url().endsWith('/audio/lofi/cafe-focus.ogg'),
  )
  await page.getByRole('button', { name: /Café Focus:/ }).click()
  expect([200, 206]).toContain((await cafeResponse).status())

  const nightResponse = page.waitForResponse((response) =>
    response.url().endsWith('/audio/lofi/lofi-again.ogg'),
  )
  await page.getByRole('button', { name: /Night Notes:/ }).click()
  expect([200, 206]).toContain((await nightResponse).status())
  await expect(page).toHaveTitle(/Night Notes · 60 minute session · Chillax/)
  await expect(page.getByRole('button', { name: 'Pause focus session' })).toBeVisible()
  await page.getByRole('button', { name: 'Pause focus session' }).click()
})

test('configures and restores a complete Pomodoro cycle', async ({ page }) => {
  await page.getByRole('button', { name: 'Custom' }).click()
  const dialog = page.getByRole('dialog', { name: 'Set your rhythm.' })
  await dialog.getByRole('button', { name: /Pomodoro/ }).click()
  await dialog.getByRole('spinbutton', { name: /Focus session/ }).fill('30')
  await dialog.getByRole('spinbutton', { name: /Short break/ }).fill('7')
  await dialog.locator('#pomodoro-long-break-minutes').fill('20')
  await dialog.locator('#pomodoro-focus-sessions').fill('3')
  await dialog.getByRole('button', { name: 'Use this session' }).click()

  await expect(page.getByLabel('30:00 remaining')).toBeVisible()
  await expect(page.getByText('Focus 1 of 3', { exact: true })).toBeVisible()
  await expect(page.getByText('30 focus / 7 short / 20 long / every 3', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Start focus session' }).click()
  await expect(page.getByRole('button', { name: 'Pause focus session' })).toBeVisible()
  await page.getByRole('button', { name: 'Pause focus session' }).click()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Focus 1 of 3', { exact: true })).toBeVisible()
  await expect(page.getByText('Focus session paused', { exact: true })).toBeVisible()
})

test('shows complete controls without truncation at the reported layout size', async ({ page }) => {
  await page.setViewportSize({ width: 718, height: 640 })

  await expect(page.locator('.session-selector__summary')).toHaveCount(0)
  expect(await page.locator('.visual-panel').evaluate((element) =>
    getComputedStyle(element, '::after').content,
  )).toBe('none')

  for (const name of ['60 minutes', 'Infinite', 'Custom']) {
    const button = page.getByRole('button', { name })
    await expect(button).toBeVisible()
    expect((await button.textContent())?.trim()).toBe(name)
    expect(await button.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  }

  const standard = page.getByRole('button', { name: /Standard: Balanced/ })
  await expect(standard).toBeVisible()
  expect((await standard.textContent())?.trim()).toBe('Standard')
  expect(await standard.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  for (const copy of await page.locator('.sound-card__copy').all()) {
    expect(await copy.evaluate((element) =>
      element.scrollWidth <= element.clientWidth + 1
      && element.scrollHeight <= element.clientHeight + 1,
    )).toBe(true)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(718)
})

test('persists dark mode and keeps the mobile transport in reach', async ({ page }) => {
  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.setViewportSize({ width: 390, height: 844 })
  const startButton = page.getByRole('button', { name: 'Start focus session' })
  const bounds = await startButton.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('does not contact third-party services', async ({ page }) => {
  const foreignOrigins = new Set<string>()
  const appOrigin = new URL(page.url()).origin
  page.on('request', (request) => {
    const requestUrl = new URL(request.url())
    if (requestUrl.origin !== appOrigin) foreignOrigins.add(requestUrl.origin)
  })

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Calm Focus/ }).click()
  await page.getByRole('button', { name: 'Start focus session' }).click()
  await expect(page.getByRole('button', { name: 'Pause focus session' })).toBeVisible()
  expect([...foreignOrigins]).toEqual([])
})
