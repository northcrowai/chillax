import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

const appBasePath = process.env.VITE_APP_BASE_PATH ?? '/'
const publicAsset = (path: string) => `${appBasePath}${path.replace(/^\//, '')}`

export default defineConfig({
  base: appBasePath,
  build: {
    assetsInlineLimit: 0,
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon-16x16.png',
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-512x512.png',
      ],
      manifest: {
        name: 'Chillax Focus',
        short_name: 'Chillax',
        description: 'Original focus tones and open ambient and lo-fi loops for calm, uninterrupted focus.',
        theme_color: '#f7f3ed',
        background_color: '#f7f3ed',
        display: 'standalone',
        orientation: 'any',
        start_url: appBasePath,
        scope: appBasePath,
        categories: ['productivity', 'lifestyle'],
        icons: [
          {
            src: publicAsset('/pwa-192x192.png'),
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: publicAsset('/pwa-512x512.png'),
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: publicAsset('/pwa-maskable-512x512.png'),
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        globPatterns: ['**/*.{html,js,css,svg,png,ico,webmanifest}'],
        navigateFallback: publicAsset('/index.html'),
        navigateFallbackDenylist: [/^\/(?:privacy|terms)(?:\.html)?$/],
        runtimeCaching: [
          {
            urlPattern: /\/weather-photos\/.*\.webp$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'chillax-weather-photos',
              expiration: {
                maxAgeSeconds: 30 * 24 * 60 * 60,
                maxEntries: 8,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/env.d.ts'],
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 65,
      },
    },
  },
})
