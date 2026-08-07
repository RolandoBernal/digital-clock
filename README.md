# Lando's World

Lando's World is a static GitHub Pages app that hosts several small family tools, including Digital Clock, Weather, Daily Chief Briefing, Violet Sprints, Death on Notecards, and Lee-Lee's Tracker.

## Lee-Lee's Tracker Shared Data

Lee-Lee's Tracker uses Supabase for authentication, shared records, synchronization, and Realtime updates. The app remains a static client-side deployment.

Data storage model:

- Supabase is the authoritative shared record source after sign-in.
- Browser storage remains the local cache, pending-operation queue, migration safety layer, and recovery fallback.
- JSON backup is the full restore-oriented backup format.
- CSV export is human-readable only and is not used for restore.

Do not put privileged Supabase credentials in frontend code. The browser may use only the project URL and publishable/anon key. Never use the service-role key or database password in this repository.

## Configuration

Local runtime config lives in `js/lee-lees-tracker-config.js`:

```js
window.LEE_LEES_TRACKER_SUPABASE_CONFIG = {
  url: 'https://YOUR-PROJECT.supabase.co',
  publishableKey: 'YOUR-PUBLISHABLE-KEY',
};
```

`.env.example` also documents reserved public variable names for a future build-injection workflow:

```sh
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Full setup steps are in `docs/SUPABASE_SETUP.md`.

## Commands

```sh
pnpm test
pnpm run check:js
pnpm run build
```

The browser app is static. For local smoke testing:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

The production GitHub Pages shell is intended to live at:

```text
https://rolandobernal.github.io/landos-world/
```

## Static Build Foundation

Lando's World intentionally remains a static app for this migration phase. The build script copies only the runtime files needed by the app shell:

```sh
pnpm run build:web
pnpm run build:native
```

`pnpm run build` creates both outputs:

- `dist/web` preserves the existing GitHub Pages path and manifest assumptions.
- `dist/native` is the future Capacitor `webDir` candidate and rewrites manifest launch paths to relative native-safe values.

GitHub Pages continues to serve the repository root until a later release explicitly changes that deployment contract.

## Runtime Detection

`js/runtime.js` exposes `window.LandosRuntime` for environment-specific behavior without introducing a framework or native dependency. Web remains the default mode. A future Capacitor shell can be detected through the Capacitor bridge, and local checks can override the mode with `window.LANDOS_RUNTIME_MODE`.

Service worker registration is gated through `LandosRuntime.shouldRegisterServiceWorker()` so browser PWA behavior stays intact while future native builds can avoid web-only registration paths.

## Local Vendor Assets

The browser Supabase client is committed at `vendor/supabase/supabase.js` and loaded from the local app bundle. Lee-Lee's Tracker still uses the same public Supabase configuration, auth, database, sync, and Realtime behavior; only the client script source moved from CDN import to local runtime asset.

## Database

Supabase SQL migrations live in `supabase/migrations`.

The current Lee-Lee's Tracker migration creates `public.lee_lee_records`, indexes, RLS policies, soft-delete metadata, attribution metadata, and Realtime publication registration.
