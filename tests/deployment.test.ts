import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface VercelHeader {
  key: string
  value: string
}

interface VercelConfig {
  headers: Array<{ source: string; headers: VercelHeader[] }>
  rewrites: Array<{ source: string; destination: string }>
}

const config = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
) as VercelConfig

describe('traffic deployment policy', () => {
  it('ships only blank, deployer-owned Google Maps configuration placeholders', () => {
    const envExample = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8')
    const gitignore = readFileSync(resolve(process.cwd(), '.gitignore'), 'utf8')

    expect(envExample).toMatch(/^VITE_GOOGLE_ROUTES_API_KEY=$/m)
    expect(envExample).toMatch(/^VITE_GOOGLE_STATIC_MAPS_API_KEY=$/m)
    expect(envExample).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/)
    expect(gitignore).toContain('.env.*')
    expect(gitignore).toContain('!.env.example')
  })

  it('serves the public legal routes before the app-shell fallback', () => {
    const privacyRule = config.rewrites.findIndex(({ source }) => source === '/privacy')
    const termsRule = config.rewrites.findIndex(({ source }) => source === '/terms')
    const appFallback = config.rewrites.findIndex(({ source }) => source === '/(.*)')

    expect(config.rewrites[privacyRule]).toEqual({ source: '/privacy', destination: '/privacy.html' })
    expect(config.rewrites[termsRule]).toEqual({ source: '/terms', destination: '/terms.html' })
    expect(privacyRule).toBeLessThan(appFallback)
    expect(termsRule).toBeLessThan(appFallback)
  })

  it('allows only the required Google traffic endpoints and device geolocation', () => {
    const globalHeaders = config.headers.find(({ source }) => source === '/(.*)')?.headers ?? []
    const headers = Object.fromEntries(globalHeaders.map(({ key, value }) => [key, value]))

    expect(headers['Permissions-Policy']).toContain('geolocation=(self)')
    expect(headers['Referrer-Policy']).toBe('no-referrer')
    expect(headers['Content-Security-Policy']).toContain(
      "connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com https://routes.googleapis.com",
    )
    expect(headers['Content-Security-Policy']).toContain(
      "img-src 'self' data: https://maps.googleapis.com",
    )
    expect(headers['Content-Security-Policy']).toContain("style-src 'self'")
    expect(headers['Content-Security-Policy']).not.toContain("'unsafe-inline'")
  })
})
