# Chillax

Chillax is a personal, installable focus app with original procedural tones and a small library of open ambient recordings and music. It has no account, subscription, analytics, database, cookies, or backend.

## What it includes

- Three generated focus tones: Deep Work, Flow State, and Calm Focus
- Nine CC0/public-domain nature recordings: four rain textures, rainy roof, two forests, fireplace, and wind
- Three seamless CC0 lo-fi music loops for studying and focused work
- Same-origin audio streaming with metadata-only preload and two-second crossfades
- Soft, Standard, and Strong texture levels; recorded sounds change EQ and density without restarting
- 60-minute, infinite, and custom sessions
- Configurable Pomodoro cycles with focus, short-break, long-break, and long-break frequency settings
- Pause, resume, reset, volume, mute, media-key, and optional wake-lock controls
- A lightweight WebGL liquid visual capped at 30 fps, with reduced-motion, visibility, and CSS fallback behavior
- Responsive desktop and mobile layouts plus remembered light and dark themes
- Refresh-safe timer recovery using absolute timestamps
- Device-local preferences and session state under the `chillax:v2` key, including automatic older-schema migration
- Installable Windows PWA behavior and offline access to the app shell and generated focus tones
- Keyboard shortcuts: `Space` for play/pause and `M` for mute
- A location-aware weather view with current conditions, hourly and five-day forecasts, local time, compact unit controls, optional GPS, and condition/time-aware photography with remembered favorites
- A day-aware Home/Work leave-by planner with device-local addresses, arrival times and cushion, weekday-aware commute switching, and a styled Google route map
- A compact leave-by clock on the Focus and Weather views that stays available while the Chillax timer and audio continue uninterrupted
- A source-linked focus quote selected from a short, verified collection on each app load

The generated audio is original. Chillax does not use Brain.fm recordings, assets, branding, patented rapid-modulation implementation, or medical claims.

The recorded pack is 19.19 MiB, is loaded only when a recorded sound is selected, and is excluded from the initial PWA precache. Source and license details are in [THIRD_PARTY_AUDIO.md](./THIRD_PARTY_AUDIO.md).

Weather photography is a same-origin, on-demand set of optimized Unsplash images. It can be hidden, changes with the forecast and local time of day, and remembers a favorite for each condition/time combination. Source and license details are in [THIRD_PARTY_PHOTOS.md](./THIRD_PARTY_PHOTOS.md).

## Use the app

Open [Chillax](https://chillax-northcrow.vercel.app) in Edge or Chrome. To install it on Windows, use the browser's **Install app** option after the first load.

The interface and generated focus tones work offline after setup. A recorded nature or lo-fi loop needs a connection the first time it is played; normal browser caching may retain it afterward, but Chillax does not promise the full recording library offline.

Weather needs a network connection for fresh conditions and forecasts. Photography falls back to the existing Chillax weather gradients if an image is unavailable. If weather is unavailable, the focus timer and audio controls continue to work normally.

Traffic needs a network connection, Google Maps Platform browser keys, and an initial route calculation from the Traffic view. Route results live only in memory and disappear on reload; Home/Work addresses, arrival times, and the cushion stay on the device. Traffic errors do not interrupt the focus timer or audio.

## Local development

Requirements: Node.js 22.12 or later in the Node 22 release line, plus npm 10 or later.

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173` in Edge or Chrome.

### Google Maps setup for Traffic

Traffic uses the Google Routes API and Maps Static API directly from the browser. Enable both APIs in a billing-enabled Google Cloud project, create a separate key for each API, and restrict both keys to the exact deployed and local website referrers. Also apply an API restriction and a conservative quota to each key. These are intentionally browser-visible keys, so key restrictions are required.

Copy `.env.example` to `.env.local` and add the restricted keys:

```text
VITE_GOOGLE_ROUTES_API_KEY=
VITE_GOOGLE_STATIC_MAPS_API_KEY=
```

Without both values, the rest of Chillax works normally and Traffic shows a configuration notice instead of making a request. Automated tests use intercepted mock responses and never call the paid Google APIs.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run test:e2e
```

The E2E suite runs against the production build and checks generated playback, real recorded streaming, timer and Pomodoro configuration, persistence, keyboard controls, light/dark themes, mobile reachability, the weather and traffic views, the PWA manifest, offline reload, and that the focus player makes no third-party runtime requests before Weather or Traffic is opened.

## Architecture

- Vite, Preact, and TypeScript
- One lazily loaded `AudioContext`
- Seeded AudioWorklet noise plus native Web Audio filters, pads, and slow stereo movement
- Native `HTMLAudioElement` streaming routed through `MediaElementAudioSourceNode` for recorded loops
- Smooth gain ramps, two-second crossfades, safe output compression, and playback-error rollback
- A dependency-free WebGL2 visual with a low-power 2D shader; no Three.js or animation framework
- Pure timer state machine with Preact hooks for browser lifecycle behavior
- A bounded traffic-aware departure-time solver over the Google Routes API, with an overview route rendered by the Maps Static API
- `vite-plugin-pwa` and Workbox for installation and app-shell caching
- Static Vercel deployment with restrictive security headers and `noindex`

## Privacy and deployment

All settings, photo favorites, searched weather places, and Traffic preferences stay in the browser. Audio and weather-photo requests go only to Chillax's own origin, and there is no remote settings storage. Weather requests are sent directly to [Open-Meteo](https://open-meteo.com/) only while the Weather view is in use. Traffic sends the chosen origin, Home destination, and timing needed for a route directly to Google Maps Platform only after a route calculation; precise GPS coordinates, route responses, and map polylines are not saved. Forecast data adapted from Open-Meteo and location data from [GeoNames](https://www.geonames.org/) are used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) with attribution in the interface. See the public [Privacy](/privacy) and [Terms](/terms) pages. The production URL is intentionally unlisted and excluded from search indexing, but it is not password protected and should not be treated as confidential.
