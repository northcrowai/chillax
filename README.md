# Chillax

Chillax is a personal, installable focus app with original procedural tones and a small library of open ambient recordings and music. It has no account, subscription, analytics, database, cookies, or backend.

## Public repository safety

This repository is safe to clone: it intentionally contains **no Google Maps API keys, deployment exports, or private addresses**. A clone will show Traffic as optional until its owner configures their own Google Cloud project.

Never add `.env.local`, a real `VITE_GOOGLE_*` value, or a hosting-provider environment export to Git. These `VITE_` variables are embedded into the browser bundle at build time, so they must be restricted browser keys—not assumed to be secret server credentials.

For agent-assisted setup, read [AGENTS.md](./AGENTS.md). Before inviting outside contributors or allowing reuse, the repository owner should choose and add an explicit software license.

## What it includes

- Three generated focus tones: Deep Work, Flow State, and Calm Focus
- Nine CC0/public-domain nature recordings: four rain textures, rainy roof, two forests, fireplace, and wind
- Six CC0 lo-fi music loops for studying and focused work
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

The recorded pack is 25.16 MiB, is loaded only when a recorded sound is selected, and is excluded from the initial PWA precache. Source and license details are in [THIRD_PARTY_AUDIO.md](./THIRD_PARTY_AUDIO.md).

Weather photography is a same-origin, on-demand set of optimized Unsplash images. It can be hidden, changes with the forecast and local time of day, and remembers a favorite for each condition/time combination. Source and license details are in [THIRD_PARTY_PHOTOS.md](./THIRD_PARTY_PHOTOS.md).

## Use the app

Open the [North Crow demo](https://chillax-northcrow.vercel.app) in Edge or Chrome. To install it on Windows, use the browser's **Install app** option after the first load.

The interface and generated focus tones work offline after setup. A recorded nature or lo-fi loop needs a connection the first time it is played; normal browser caching may retain it afterward, but Chillax does not promise the full recording library offline.

Weather needs a network connection for fresh conditions and forecasts. Photography falls back to the existing Chillax weather gradients if an image is unavailable. If weather is unavailable, the focus timer and audio controls continue to work normally.

Traffic needs a network connection and the deployment owner's Google Maps Platform browser keys. Route results live only in memory; Home/Work addresses, arrival times, and the cushion stay on the device. On weekdays, Chillax calculates the next route when an app with a saved commute opens, then refreshes at most hourly during useful pre-departure windows. Traffic errors do not interrupt the focus timer or audio.

## Local development

Requirements: Node.js 22.12 or later in the Node 22 release line, plus npm 10 or later.

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173` in Edge or Chrome.

### Google Maps setup for Traffic

Traffic is optional. If you want leave-by estimates and route maps, create a **new Google Cloud project that you control** with billing enabled. Do not reuse any key from the North Crow demo or another person's deployment.

1. In Google Cloud, enable **Routes API** and **Maps Static API** for that project.
2. Create **two separate API keys**:
   - Routes key: restrict the key to **Routes API** only.
   - Map key: restrict the key to **Maps Static API** only.
3. Apply website/referrer restrictions to both keys:
   - Local development: `http://127.0.0.1:5173/*` and `http://localhost:5173/*`
   - Production: your exact deployed origin, for example `https://chill.example.com/*`
4. Set conservative API quotas and Cloud Billing alerts. A leave-time calculation can make more than one Routes request while it refines the departure time. Chillax's automatic checks run Monday–Friday only, no more than hourly, while the visible app is within three hours of departure. Manual calculation still works on weekends.
5. Avoid putting production Google keys in public preview deployments. Use exact referrer restrictions for each preview host or leave Traffic unconfigured there.

These are intentionally browser-visible keys, so referrer and API restrictions are mandatory. The [Google Maps Platform pricing calculator](https://mapsplatform.google.com/pricing/) and [quota guidance](https://developers.google.com/maps/billing-and-pricing/manage-costs) are the authoritative places to set a spending guardrail.

Copy `.env.example` to `.env.local` and add the restricted keys:

```powershell
Copy-Item .env.example .env.local
```

```text
VITE_GOOGLE_ROUTES_API_KEY=
VITE_GOOGLE_STATIC_MAPS_API_KEY=
```

For a hosted deployment, set those exact variable names in the host's **build-time environment** and redeploy; Vite reads `VITE_` variables while building. Do not commit `.env.local`. Without both values, the rest of Chillax works normally and Traffic shows a configuration notice instead of making a request. Automated tests use intercepted mock responses and never call the paid Google APIs.

### Traffic troubleshooting

- **“Traffic setup needed”**: one or both variables were absent when the app was built. Check `.env.local` locally or the host's build-time environment, then rebuild.
- **Google rejected route permission**: confirm the Routes key is restricted to Routes API and that its referrer restriction exactly includes the deployed page's origin.
- **No route map**: confirm the Maps Static key is restricted to Maps Static API and its referrer restriction includes the deployed page's origin.
- **Unexpected Google cost**: review Routes API and Maps Static API usage separately, reduce the provider quota, and check that only intended domains are permitted.

## Deployment

This app is a static Vite build. Any static host can serve `dist/`; Vercel is configured in `vercel.json`.

1. Add your own Traffic variables to the host, if using Traffic.
2. Run `npm run verify` locally.
3. Deploy the generated app. For a root-hosted site, the default base path is `/`.
4. For a subpath deployment, set `VITE_APP_BASE_PATH` and update the host rewrites together. The included `/chill` rewrites are specific to the North Crow deployment and are an example, not a requirement for a new host.
5. Smoke-test `/`, `/weather`, `/traffic`, `/privacy`, and `/terms` on the final public origin.

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

All settings, photo favorites, searched weather places, and Traffic preferences stay in the browser. Audio and weather-photo requests go only to Chillax's own origin, and there is no remote settings storage. Weather requests are sent directly to [Open-Meteo](https://open-meteo.com/) only while the Weather view is in use. When Traffic is configured, a manual calculation—or one automatic weekday check for a saved commute—sends the chosen origin, Home destination, and timing needed for a route directly to the deployment owner's Google Maps Platform project. Precise GPS coordinates, route responses, and map polylines are not saved. Forecast data adapted from Open-Meteo and location data from [GeoNames](https://www.geonames.org/) are used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) with attribution in the interface. See the public [Privacy](/privacy) and [Terms](/terms) pages. The production URL is intentionally unlisted and excluded from search indexing, but it is not password protected and should not be treated as confidential.
