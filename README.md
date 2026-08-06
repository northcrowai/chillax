# Chillax

Chillax is a personal, installable focus app with original procedural tones and a small library of open ambient recordings. It has no account, subscription, analytics, database, cookies, or backend.

## What it includes

- Three generated focus tones: Deep Work, Flow State, and Calm Focus
- Nine CC0/public-domain nature recordings: four rain textures, rainy roof, two forests, fireplace, and wind
- Same-origin audio streaming with metadata-only preload and two-second crossfades
- Soft, Standard, and Strong texture levels; recorded sounds change EQ and density without restarting
- 25, 50, 90, custom, and endless sessions
- Pause, resume, reset, volume, mute, media-key, and optional wake-lock controls
- A lightweight WebGL liquid visual capped at 30 fps, with reduced-motion, visibility, and CSS fallback behavior
- Responsive desktop and mobile layouts plus remembered light and dark themes
- Refresh-safe timer recovery using absolute timestamps
- Device-local preferences under the versioned `chillax:v2` key, including automatic `v1` migration
- Installable Windows PWA behavior and offline access to the app shell and generated focus tones
- Keyboard shortcuts: `Space` for play/pause and `M` for mute

The generated audio is original. Chillax does not use Brain.fm recordings, assets, branding, patented rapid-modulation implementation, or medical claims.

The recorded pack is 13.27 MiB, is loaded only when a nature sound is selected, and is excluded from the initial PWA precache. Source and license details are in [THIRD_PARTY_AUDIO.md](./THIRD_PARTY_AUDIO.md).

## Use the app

Open [Chillax](https://chillax-northcrow.vercel.app) in Edge or Chrome. To install it on Windows, use the browser's **Install app** option after the first load.

The interface and generated focus tones work offline after setup. A recorded nature loop needs a connection the first time it is played; normal browser caching may retain it afterward, but Chillax does not promise the full recording library offline.

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

The E2E suite runs against the production build and checks generated playback, real recorded streaming, crossfades, persistence, keyboard controls, light/dark themes, mobile reachability, the PWA manifest, offline reload, and the absence of third-party runtime requests.

## Architecture

- Vite, Preact, and TypeScript
- One lazily loaded `AudioContext`
- Seeded AudioWorklet noise plus native Web Audio filters, pads, and slow stereo movement
- Native `HTMLAudioElement` streaming routed through `MediaElementAudioSourceNode` for recorded loops
- Smooth gain ramps, two-second crossfades, safe output compression, and playback-error rollback
- A dependency-free WebGL2 visual with a low-power 2D shader; no Three.js or animation framework
- Pure timer state machine with Preact hooks for browser lifecycle behavior
- `vite-plugin-pwa` and Workbox for installation and app-shell caching
- Static Vercel deployment with restrictive security headers and `noindex`

## Privacy and deployment

All settings stay in the browser. Audio requests go only to Chillax's own origin; there is no third-party runtime traffic or remote settings storage. The production URL is intentionally unlisted and excluded from search indexing, but it is not password protected and should not be treated as confidential.
