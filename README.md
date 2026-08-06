# Chillax

Chillax is a personal, installable focus app that creates original ambient soundscapes directly in the browser. It is intentionally small: no account, subscription, analytics, database, or third-party audio.

## What it includes

- Three procedural soundscapes: Deep Work, Flow, and Calm Focus
- Soft, Standard, and Strong texture levels
- 25, 50, 90, custom, and endless sessions
- Pause, resume, reset, volume, mute, media-key, and optional wake-lock controls
- Refresh-safe timer recovery using absolute timestamps
- Device-local preferences under the versioned `chillax:v1` key
- Installable Windows PWA with offline support after the first load
- Keyboard shortcuts: `Space` for play/pause and `M` for mute

The audio is original and generated with Web Audio. Chillax does not use Brain.fm recordings, assets, branding, patented rapid-modulation implementation, or medical claims.

## Use the app

Open [Chillax](https://chillax-northcrow.vercel.app) in Edge or Chrome. To install it on Windows, use the browser's **Install app** option after the first load. The same URL continues to work offline once the initial cache is ready.

## Local development

Requirements: Node.js 22.12 or later in the Node 22 release line, plus npm 10 or later.

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173` in Edge or Chrome.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run test:e2e
```

The E2E suite runs against the production build and checks playback, persistence, keyboard controls, the PWA manifest, offline reload, and the absence of third-party requests.

## Architecture

- Vite, Preact, and TypeScript
- One lazily loaded `AudioContext`
- Seeded AudioWorklet noise plus native Web Audio filters, pads, and slow stereo movement
- Smooth gain ramps, crossfades, safe output compression, and one processor recovery attempt
- Pure timer state machine with Preact hooks for browser lifecycle behavior
- `vite-plugin-pwa` and Workbox for installation and offline caching
- Static Vercel deployment with restrictive security headers and `noindex`

## Privacy and deployment

All settings stay in the browser. The app makes no third-party requests and has no remote storage. The production URL is intentionally unlisted and excluded from search indexing, but it is not password protected and should not be treated as confidential.
