import { expect, test } from '@playwright/test'

const makeWeatherResponse = () => ({
  latitude: 32.82,
  longitude: -117.1,
  timezone: 'America/Los_Angeles',
  timezone_abbreviation: 'PDT',
  current: {
    time: '2026-08-06T15:00',
    temperature_2m: 84,
    apparent_temperature: 86,
    relative_humidity_2m: 52,
    precipitation: 0,
    weather_code: 2,
    is_day: 1,
    wind_speed_10m: 7,
    wind_direction_10m: 270,
    wind_gusts_10m: 12,
  },
  hourly: {
    time: Array.from({ length: 24 }, (_, index) =>
      `2026-08-06T${String(index).padStart(2, '0')}:00`),
    temperature_2m: Array.from({ length: 24 }, (_, index) => 70 + index / 2),
    apparent_temperature: Array.from({ length: 24 }, (_, index) => 70 + index / 2),
    precipitation_probability: Array.from({ length: 24 }, (_, index) => index),
    weather_code: Array.from({ length: 24 }, () => 2),
    wind_speed_10m: Array.from({ length: 24 }, () => 7),
  },
  daily: {
    time: Array.from({ length: 6 }, (_, index) =>
      `2026-08-${String(index + 6).padStart(2, '0')}`),
    weather_code: [2, 1, 0, 3, 61, 2],
    temperature_2m_max: [84, 86, 85, 82, 78, 80],
    temperature_2m_min: [68, 69, 70, 68, 66, 67],
    precipitation_probability_max: [5, 4, 2, 10, 55, 8],
    sunrise: Array.from({ length: 6 }, (_, index) =>
      `2026-08-${String(index + 6).padStart(2, '0')}T06:05`),
    sunset: Array.from({ length: 6 }, (_, index) =>
      `2026-08-${String(index + 6).padStart(2, '0')}T19:42`),
    wind_speed_10m_max: [10, 11, 9, 8, 14, 9],
  },
})

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

  await expect(page.getByText('Find your quiet.', { exact: true })).toBeVisible()
  await expect(page.locator('.intro--quote h1')).not.toHaveText('')
  await expect(page.getByRole('link', { name: 'North Crow home' }).locator('img')).toBeVisible()
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

  for (const legalPage of ['privacy', 'terms']) {
    const legalResponse = await request.get(`/${legalPage}.html`)
    expect(legalResponse.ok()).toBeTruthy()
    expect(await legalResponse.text()).toContain(`<title>${legalPage === 'privacy' ? 'Privacy' : 'Terms'} | Chillax</title>`)
  }

  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable.')
    await navigator.serviceWorker.ready
  })
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Find your quiet.', { exact: true })).toBeVisible()
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

test('opens weather without interrupting the active timer or audio controls', async ({ page }) => {
  await page.route('https://api.open-meteo.com/**', async (route) => {
    await route.fulfill({
      body: JSON.stringify(makeWeatherResponse()),
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      status: 200,
    })
  })

  await expect(page.getByRole('button', { name: 'Open traffic' })).toBeEnabled()
  await page.getByRole('button', { name: 'Start focus session' }).click()
  await expect(page.getByRole('button', { name: 'Pause focus session' })).toBeVisible()
  await page.waitForTimeout(1_100)

  await page.getByRole('button', { name: 'Open weather' }).click()
  await expect(page).toHaveURL(/\/weather$/)
  await expect(page.getByRole('heading', { level: 1, name: /Weather in Tierrasanta/ })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Close weather and return to focus' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText('Next 24 hours')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause focus session' })).toBeVisible()
  const weatherHero = page.locator('.weather-hero')
  await expect(weatherHero).toHaveClass(/has-photo/)
  await expect(weatherHero.locator('.weather-hero__photo')).toBeVisible()
  expect(await weatherHero.evaluate((hero) => getComputedStyle(hero, '::before').display)).toBe('none')
  expect(await weatherHero.evaluate((hero) => getComputedStyle(hero, '::after').display)).toBe('none')
  await expect(page.getByRole('link', { name: 'Unsplash' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Use Fahrenheit' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: 'Use 12-hour time' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  for (const control of await page.locator('.weather-segmented-control').all()) {
    const bounds = await control.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.width).toBeLessThanOrEqual(100)
  }

  const favoritePhoto = page.getByRole('button', { name: 'Favorite this weather photo' })
  await expect(favoritePhoto).toBeEnabled()
  await favoritePhoto.click()
  await expect(page.getByRole('button', {
    name: 'Remove this weather photo from favorites',
  })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Hide weather photography' }).click()
  await expect(weatherHero).not.toHaveClass(/has-photo/)
  await expect(weatherHero.locator('.weather-hero__photo')).toHaveCount(0)
  expect(await weatherHero.evaluate((hero) => getComputedStyle(hero, '::before').display)).not.toBe('none')
  await page.getByRole('button', { name: 'Show weather photography' }).click()
  await expect(weatherHero).toHaveClass(/has-photo/)

  const weatherTimer = page.getByLabel(/on the Chillax timer/)
  const before = await weatherTimer.textContent()
  await page.waitForTimeout(1_100)
  await expect(weatherTimer).not.toHaveText(before ?? '')

  await page.setViewportSize({ width: 390, height: 844 })
  const locationSearch = page.getByRole('searchbox', { name: 'Location' })
  await expect(locationSearch).toBeVisible()
  await locationSearch.focus()
  const searchOutline = await locationSearch.evaluate((input) => {
    const styles = getComputedStyle(input)
    return { style: styles.outlineStyle, width: Number.parseFloat(styles.outlineWidth) }
  })
  expect(searchOutline.style).not.toBe('none')
  expect(searchOutline.width).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'Pause focus session' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  await page.getByRole('button', { name: 'Back to focus' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Pause focus session' })).toBeVisible()
  await page.getByRole('button', { name: 'Pause focus session' }).click()
})

test('plans a mocked drive without interrupting the session and keeps only preferences', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-06T16:00:00-07:00'))
  await page.reload()

  let routeRequest: Record<string, unknown> | null = null
  await page.route('https://routes.googleapis.com/**', async (route) => {
    routeRequest = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      body: JSON.stringify({
        routes: [{
          distanceMeters: 18_000,
          duration: '1800s',
          staticDuration: '1500s',
          polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
          legs: [{
            startLocation: { latLng: { latitude: 32.75, longitude: -117.15 } },
            endLocation: { latLng: { latitude: 32.82, longitude: -117.1 } },
          }],
          viewport: {
            low: { latitude: 32.75, longitude: -117.15 },
            high: { latitude: 32.82, longitude: -117.1 },
          },
        }],
      }),
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      status: 200,
    })
  })
  await page.route('https://maps.googleapis.com/maps/api/staticmap**', async (route) => {
    await route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#e8dfec"/><path d="M60 320 C180 240 250 260 340 170 S500 80 580 95" fill="none" stroke="#9f4fbc" stroke-width="12"/><circle cx="60" cy="320" r="15" fill="#4d806d"/><circle cx="580" cy="95" r="15" fill="#9f4fbc"/></svg>',
      contentType: 'image/svg+xml',
      status: 200,
    })
  })
  await page.route('https://api.open-meteo.com/**', async (route) => {
    await route.fulfill({
      body: JSON.stringify(makeWeatherResponse()),
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      status: 200,
    })
  })

  await page.getByRole('button', { name: 'Start focus session' }).click()
  await expect(page.getByRole('button', { name: 'Pause focus session' })).toBeVisible()
  await page.getByRole('button', { name: 'Open traffic' }).click()
  await expect(page).toHaveURL(/\/traffic$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Get home on time.' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Pause focus session' })).toBeVisible()

  await page.getByRole('textbox', { name: 'Home', exact: true }).fill('100 Example Avenue')
  await page.getByLabel('Be home by').fill('18:00')
  await page.getByRole('button', { name: '10 minute arrival cushion' }).click()
  await page.getByRole('button', { name: 'Enter a location' }).click()
  await page.getByRole('textbox', { name: 'Where are you leaving from?' }).fill('200 Sample Street')

  const calculateButton = page.getByRole('button', { name: 'Calculate leave time' })
  await expect(calculateButton).toBeEnabled()
  await calculateButton.click()
  await expect(page.getByLabel('Your leave time').getByText('5:20 PM', { exact: true })).toBeVisible()
  await expect(page.getByText('30 min', { exact: true })).toBeVisible()
  await expect(page.getByText('+5 min', { exact: true })).toBeVisible()
  await expect(page.getByAltText('Google Maps route from your starting point to home')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(routeRequest).toMatchObject({
    destination: { address: '100 Example Avenue' },
    origin: { address: '200 Sample Street' },
    routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
    trafficModel: 'BEST_GUESS',
    travelMode: 'DRIVE',
  })

  await page.getByRole('button', { name: 'Open weather' }).click()
  await expect(page.getByRole('status', { name: /Traffic reminder: leave by 5:20 PM/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause focus session' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to focus' }).click()
  await expect(page.getByRole('status', { name: /Traffic reminder: leave by 5:20 PM/ })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('status', { name: /Traffic reminder/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Open traffic' }).click()
  await expect(page.getByRole('textbox', { name: 'Home', exact: true })).toHaveValue('100 Example Avenue')
  await expect(page.getByLabel('Be home by')).toHaveValue('18:00')
  await expect(page.getByRole('button', { name: '10 minute arrival cushion' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('textbox', { name: 'Where are you leaving from?' })).toHaveCount(0)
})

test('the focus player does not contact third-party services before Weather or Traffic is opened', async ({ page }) => {
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
