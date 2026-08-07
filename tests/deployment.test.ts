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
  it('serves the public legal routes before the app-shell fallback', () => {
    expect(config.rewrites.slice(0, 3)).toEqual([
      { source: '/privacy', destination: '/privacy.html' },
      { source: '/terms', destination: '/terms.html' },
      { source: '/(.*)', destination: '/index.html' },
    ])
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
