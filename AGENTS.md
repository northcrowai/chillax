# Chillax contributor and deployment guide

Use this guide when modifying, deploying, or helping someone configure a clone of Chillax.

## Safety first

- Treat this as a public repository. Do not add API keys, `.env.local`, Vercel environment exports, real addresses, screenshots containing private data, or generated test artifacts to Git.
- Keep `.env.example` blank. `VITE_` variables are browser-visible build configuration, not server secrets.
- Do not reuse any key from another Chillax deployment. Every deployment owner needs their own Google Cloud project, keys, quota, and billing controls.
- Preserve the optional nature of Traffic: Focus and Weather must still work when both Google variables are absent.

## Configure Traffic

1. Read the **Google Maps setup for Traffic** section in `README.md` before making changes.
2. Use two different API keys from the deployment owner's Google Cloud project:
   - `VITE_GOOGLE_ROUTES_API_KEY`: restrict to **Routes API** only.
   - `VITE_GOOGLE_STATIC_MAPS_API_KEY`: restrict to **Maps Static API** only.
3. Apply application/referrer restrictions for the exact production domain, plus `http://127.0.0.1:5173/*` and `http://localhost:5173/*` for local development.
4. Set both values in `.env.local` for local work and in the hosting provider's build-time environment for production. Rebuild/redeploy after changing either value.
5. Keep Traffic environment variables out of public preview deployments unless their referrer restrictions cover those exact preview URLs.

## Traffic behavior

- Traffic preferences are device-local. Route responses and coordinates stay in memory and are not persisted.
- With saved preferences, Chillax calculates the next commute once when the app opens.
- Automatic refreshes occur Monday through Friday, while the app is visible and online, at most once per hour in the three hours before departure. Automatic Google route calls do not run on weekends; manual recalculation still works.
- A leave-time calculation can make multiple Routes API calls while solving. Preserve the hourly cooldown and bounded request timeout unless a user explicitly changes the cost policy.

## Validate and release

Run these from the repository root after relevant changes:

```powershell
npm run verify
```

Before publishing, confirm:

- `git status --short` contains only intended files.
- No key-looking values exist in tracked files.
- The deployed site uses the intended base path and its own environment variables.
- `/`, `/weather`, `/traffic`, `/privacy`, and `/terms` work on the deployed host. If using a subpath, update `VITE_APP_BASE_PATH` and hosting rewrites together.

Use a narrow commit. Do not commit unrelated local changes.
