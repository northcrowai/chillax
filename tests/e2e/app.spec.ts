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
  await expect(page.getByRole('button', { name: 'Start focus session' })).toBeEnabled()
  await expect(page.getByLabel('50:00 remaining')).toBeVisible()
  await expect(page.getByRole('button', { name: /Deep Work/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.vite-error-overlay')).toHaveCount(0)
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('plays, changes soundscape, pauses, and remembers choices', async ({ page }) => {
  await page.getByRole('button', { name: /Flow/ }).click()
  await page.getByRole('button', { name: /Strong: Fuller/ }).click()
  await page.getByRole('button', { name: /25 min/ }).click()
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
  await expect(page.getByText('Session paused', { exact: true })).toBeVisible()
})

test('supports keyboard playback, mute, settings, and reset', async ({ page }) => {
  await page.locator('body').press('Space')
  await expect(page.getByRole('button', { name: 'Pause focus session' })).toBeVisible()

  await page.locator('body').press('m')
  await expect(page.getByLabel('Volume 0 percent')).toBeVisible()

  await page.getByRole('button', { name: 'Pause focus session' }).click()
  await page.getByRole('button', { name: 'Open settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Keep it simple.' })).toBeVisible()
  await expect(page.getByText(/no account, analytics, or remote data storage/i)).toBeVisible()
  await page.getByRole('button', { name: 'Restore default settings' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('50:00 remaining')).toBeVisible()
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

  const dialog = page.getByRole('dialog', { name: 'Keep it simple.' })
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
