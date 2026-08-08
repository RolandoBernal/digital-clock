# Lando's World Native Readiness Audit

Audit date: 2026-08-07  
Repository: `/Users/rolandobernal/Documents/My Code/landos-world`  
Remote: `https://github.com/rolandobernal/landos-world.git`  
Current branch during audit: `main`

## Executive Summary

Overall readiness rating: **Moderate to strong candidate, not native-ready yet**

Lando's World is a good Capacitor candidate because the production app is already a static, vanilla HTML/CSS/JavaScript application with hash-routed local apps, local icon/font assets, localStorage-backed local features, and a clear GitHub Pages deployment target. A React, React Native, or framework rewrite is not necessary for the first native iPhone release.

The main native-readiness gaps are:

1. **True offline first launch is not guaranteed by the current PWA strategy.** The web PWA must complete its first service-worker precache while online before it can launch offline. A native build should bundle the shell files directly and should not depend on service-worker registration.
2. **Lee-Lee's Tracker imports Supabase from a CDN at runtime.** `js/lee-lees-tracker-sync.js:3` imports `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`; this breaks true offline startup for shared sync and is undesirable for a native bundle.
3. **The manifest is GitHub Pages-specific.** `manifest.webmanifest:4-7` and shortcut/icon URLs use absolute `/landos-world/` paths. This is correct for GitHub Pages but not for Capacitor file/app origins.
4. **The app has no build output directory.** `package.json` only has syntax and test scripts. There is no `dist/`, bundling, copy step, minification, or native-specific output.
5. **Light/dark mode is not a real shared system yet.** `css/app-themes.css` defines accent tokens, but most surfaces are dark hardcoded colors across app CSS files.

Recommended first implementation sprint:

1. Add a minimal static bundle script that copies only runtime web files into a native-ready `www/` or `dist/` directory.
2. Add an environment/runtime flag such as `window.LANDOS_RUNTIME = 'web' | 'capacitor'` or equivalent detection.
3. Make service-worker registration web-only.
4. Replace the runtime Supabase CDN import with a locally bundled browser-safe Supabase client path for native builds.
5. Normalize root-relative manifest/path assumptions without changing production behavior.

## A. Project Structure

### Current Architecture

Lando's World is a static multi-app shell served by `index.html`. It uses vanilla JavaScript and hash routing instead of a framework router. The app shell renders all core app containers up front and toggles views with `hidden`.

Primary entry points:

- `index.html`: Main Lando's World shell, launcher, route handling, Digital Clock inline logic, and script/style includes.
- `index-digital-clock.html`: Legacy compatibility entry that redirects to `./#/digital-clock`.
- `manifest.webmanifest`: Web/PWA install metadata.
- `service-worker.js`: PWA precache, runtime cache, weather cache, app-shell fallback, and cache-management message API.

Local app modules:

- Digital Clock: mostly inline in `index.html`, styles in `css/digital-clock.css`, local weather cache in `index.html`.
- Weather: `js/weather-service.js`, `js/weather-app.js`, `css/weather-app.css`.
- Lee-Lee's Tracker: `js/levi-diabetes-tracker.js`, `js/lee-lees-tracker-sync.js`, `js/lee-lees-tracker-config.js`, `css/levi-diabetes.css`, Supabase migrations in `supabase/migrations`.
- Violet Sprints: `js/sprints-app.js`, `css/sprints.css`.
- Road Bike Trip Checklist: `js/road-bike-checklist.js`, `css/road-bike-checklist.css`.
- Daily Chief Briefing: `js/daily-chief-briefing.js`, `css/daily-chief-briefing.css`, optional backend API files under `api/daily-chief-briefing/`.
- Death on Notecards: launcher card only, external URL in `index.html:386`.

Shared infrastructure:

- `css/app-themes.css`: app accent tokens such as `--app-accent`.
- `css/digital-clock.css`: also contains shared page layout, ecosystem nav, PWA network status, PWA toast, and settings panel styles.
- `js/pwa-manager.js`: service-worker registration, offline readiness panel, install prompt, storage persistence request, cache clearing, online/offline events.
- `service-worker.js`: precache/runtime cache.
- `icons/` and top-level icons: local image/icon assets.
- `fonts/digital-7.ttf`: local font asset.

Navigation:

- Launcher cards are declared in `APP_CARDS` at `index.html:387-467`.
- Routes are active hash route names in `LANDO_ACTIVE_ROUTES` at `index.html:592-600`.
- View toggling occurs in `setActiveView` at `index.html:607-620`.
- Route parsing uses `window.location.hash` at `index.html:637`.
- Route changes write `window.location.hash` at `index.html:643`.

Generated vs source:

- No active generated runtime output directory exists.
- `DigitalClockBlazor/obj` is generated .NET build output and should not be part of a Capacitor web bundle.
- `node_modules/` and `.pnpm-store/` exist locally but are dependencies/tooling, not source.
- The current browser runtime source is the root static asset tree, excluding `DigitalClockBlazor/`, `node_modules/`, `.git/`, `.pnpm-store/`, tests, docs, and backend-only API files unless intentionally bundled.

## B. URL and Path Audit

### GitHub Pages Base Path

Findings:

- `manifest.webmanifest:4-7` uses `"id"`, `"start_url"`, and `"scope"` as `/landos-world/`.
- `manifest.webmanifest:19-83` uses absolute `/landos-world/...` icon and shortcut paths.
- `README.md:53-57` documents production at `https://rolandobernal.github.io/landos-world/`.
- `docs/SUPABASE_SETUP.md:103-106` documents the GitHub Pages app URL as the Supabase redirect URL.

GitHub Pages: works and is intentional.  
Capacitor: not suitable as-is because absolute `/landos-world/` paths do not map cleanly to a bundled app origin.  
Eventual fix: keep the GitHub Pages manifest for web, but generate or copy a native-specific manifest only if needed, with relative paths or omit web manifest from the native runtime. Capacitor does not need PWA manifest semantics for native launch.

### Canonical and External Web URLs

Findings:

- `index.html:13-14` has GitHub Pages Open Graph/canonical URLs.
- `index.html:68` links the footer to `http://rolandobernal.github.io`.
- `index-digital-clock.html:10` canonicalizes the old Digital Clock entry to `https://rolandobernal.github.io/landos-world/#/digital-clock`.
- `index.html:386` defines `DEATH_ON_NOTECARDS_URL = 'https://rolandobernal.github.io/death-on-notecards/'`.

GitHub Pages: works.  
Capacitor: canonical metadata is harmless, but footer and Death on Notecards should open externally, not inside the native WebView unless that app is bundled later. The footer should be `https` eventually.  
Eventual fix: add a small external-link adapter in native runtime using Capacitor Browser/App Launcher, and leave web anchors unchanged.

### Compatibility Redirect

Finding:

- `index-digital-clock.html:9-16` redirects to `./#/digital-clock`, preserving `search` and existing `hash`.

GitHub Pages: works for old bookmarks.  
Capacitor: unnecessary in the native app bundle unless old in-app file URLs are expected. It should not be used as the native entry point.  
Eventual fix: preserve this file for web deployment. Native `webDir` should point to the generated bundle's `index.html`.

### Hash Routing

Findings:

- Back links use `href="#/"` in `index.html:74`, `index.html:106`, `index.html:126`, `index.html:146`, `index.html:166`, `index.html:271`, and generated Sprints nav at `js/sprints-app.js:34`.
- Route parsing and setting use hash logic at `index.html:637-643`.
- Sprints checks `window.location.hash` at `js/sprints-app.js:1543` and `js/sprints-app.js:1561`.

GitHub Pages: works well and avoids 404 problems under Pages.  
Capacitor: works because hash routing is origin/path independent.  
Eventual fix: keep hash routing for the first native release.

### Fetch Paths

Findings:

- Weather live data: `index.html:500`, `index.html:1177`, `js/weather-service.js:2-3`, `js/weather-service.js:161`, `js/weather-service.js:287`.
- Daily Chief Briefing generation: `js/daily-chief-briefing.js:80` posts to `${base}/generate`.
- Daily Chief Briefing same-origin backend inference: `js/daily-chief-briefing.js:144-150`.
- Service-worker precache fetches relative URLs at `service-worker.js:145-160`.

GitHub Pages: weather works; Daily Chief Briefing generation is intentionally not configured on GitHub Pages unless a backend URL is supplied.  
Capacitor: weather can work online and fail gracefully only if cache exists or UI handles error. Daily Chief Briefing same-origin backend inference should be disabled or replaced with an explicit backend URL in native because Capacitor's origin is not GitHub Pages.  
Eventual fix: make live services runtime-configured and optional, with offline-empty states for startup.

## C. Offline / PWA Audit

### Service Worker Registration

- `js/pwa-manager.js:4` registers `./service-worker.js`.
- `js/pwa-manager.js:330-380` performs registration and readiness checks.
- `js/pwa-manager.js:496-501` always initializes registration on DOMContentLoaded.

Current web behavior is appropriate for GitHub Pages. For Capacitor, service workers are unnecessary and can be unsupported or confusing depending on WebView origin and platform behavior.

Recommendation: native builds should avoid registering the service worker. Add a runtime guard before Capacitor installation, then validate the GitHub Pages PWA path still registers normally.

### Cache Strategy

- Precache list at `service-worker.js:10-57` includes shell HTML, CSS, JS, icons, and font.
- Weather hosts are cached stale-while-revalidate at `service-worker.js:59-62` and `service-worker.js:223-225`.
- Navigations use cache-first app shell fallback at `service-worker.js:228-234`.
- Cache cleanup only deletes names beginning with `landos-world-` at `service-worker.js:187-195`.
- Activation deletes older owned caches at `service-worker.js:204-214`.

Why the current PWA can still fail to launch offline:

- First launch offline cannot install or populate the service-worker precache because `precacheApplicationShell` fetches every precache URL during install (`service-worker.js:145-160`).
- If any required precache request fails during install, the install fails.
- A user who never completed an online service-worker install/update may have no cached shell.
- A stale or partial cache can cause the settings panel to report errors, but it cannot manufacture missing first-launch files.

What should remain for GitHub Pages:

- `service-worker.js`
- `js/pwa-manager.js`
- PWA manifest
- Cache status/settings UI
- Cache-first shell and stale weather cache

What should not be relied upon inside Capacitor:

- Service-worker registration
- PWA install prompt
- Web manifest start/scope
- Cache Storage as the source of bundled shell availability

Native target:

- Bundle the shell and local assets in Capacitor `webDir`.
- Treat service worker as web-only.
- Use local app files for offline startup.
- Use explicit offline states for Weather/Supabase/Daily Chief Briefing live features.

## D. Remote Asset Audit

Remote resources found:

| Resource | File/line | Classification | Native concern | Recommendation |
|---|---:|---|---|---|
| Supabase JS CDN | `js/lee-lees-tracker-sync.js:3`, `js/lee-lees-tracker-sync.js:50-54` | Required for Lee-Lee shared sync/auth, not for basic shell | Breaks native offline sync initialization and depends on CDN at runtime | Bundle locally before Capacitor |
| Supabase project API | `js/lee-lees-tracker-config.js:5` | Live-data dependency | Required for sync/auth online | Keep remote, show offline queue state |
| Open-Meteo forecast/geocoding | `js/weather-service.js:2-3`, `index.html:500` | Live-data dependency | Weather unavailable offline unless cached | Keep remote, use cached/stale/offline UI |
| Death on Notecards | `index.html:386` | Optional external app | Leaves Lando's World scope and is not bundled | Open externally in native; bundle later only if in scope |
| Rolando footer link | `index.html:68` | Optional external link | Should open outside native app | Use external-link adapter |
| Daily Chief Briefing backend | `js/daily-chief-briefing.js:80`, `js/daily-chief-briefing.js:144-150` | Optional live generation | Same-origin inference not valid in native | Require explicit backend URL or disable generation offline |
| OpenAI backend env | `api/daily-chief-briefing/*.js`, `.env.example:1-4` | Backend-only live dependency | Should not be bundled as client runtime | Exclude from native webDir unless shipping local docs/dev backend intentionally |

No remote Google Fonts, remote CSS, remote render-blocking font CSS, or remote startup images were found. `fonts/digital-7.ttf` is local.

Assets that must be bundled for true offline startup:

- `index.html`
- `index-digital-clock.html` only for web compatibility, not native entry
- All `css/*.css`
- All `js/*.js` needed by local apps, except backend API files
- `fonts/digital-7.ttf`
- Top-level icons and `icons/*`
- `manifest.webmanifest` for web only; optional/native-specific for native

## E. Storage Audit

| Feature/app | Mechanism | Data stored | Critical | Survive restarts | Sync devices | Capacitor safety | Long-term recommendation |
|---|---|---|---|---|---|---|---|
| Digital Clock | `localStorage` key `digit_clock_preferences_v1` (`index.html:296`, `index.html:755`, `index.html:838`) | Unit/language preferences | Low | Yes | No | Safe enough | Keep in Preferences/localStorage; optional native Preferences later |
| Digital Clock weather | `localStorage` keys `digit_clock_weather_*_v1` (`index.html:474-496`, `index.html:1152-1167`) | Cached current weather per city | Low | Nice to have | No | Safe | Keep cache; allow stale display |
| Weather | `localStorage` key `weather_app_preferences_v1` (`js/weather-app.js:2`, `js/weather-app.js:23`, `js/weather-app.js:43`) | Saved location | Medium | Yes | No | Safe | Keep local; consider native Preferences later |
| Weather service | `localStorage` keys `daily_chief_weather_cache_v1`, `daily_chief_weather_geocode_cache_v1` (`js/weather-service.js:4-5`, `js/weather-service.js:255-264`) | Forecast snapshots and geocodes | Low | Nice to have | No | Safe | Keep; TTL/stale behavior |
| Daily Chief Briefing | `localStorage` key `daily_chief_briefing_documents_v1` (`js/daily-chief-briefing.js:3`, `js/daily-chief-briefing.js:225-286`) | Documents, preferences, generation endpoint | Medium | Yes | Not currently | Safe but can grow | Keep local; consider file backup/share later |
| Daily Chief Briefing legacy | `localStorage` key `daily_chief_briefing_state_v1` (`js/daily-chief-briefing.js:2`, `js/daily-chief-briefing.js:190-205`) | Legacy preferences migration source | Low | Preserve | No | Safe | Preserve until migration retirement |
| Lee-Lee Tracker records | `localStorage` key `lando-world:lee-lees-tracker:v1` (`js/levi-diabetes-tracker.js:2`, `js/levi-diabetes-tracker.js:719-743`) | Records, settings, insulin plans, recovery metadata | Critical | Yes | Yes via Supabase | Acceptable for first native, but localStorage is not ideal medical cache storage | Migrate eventually to SQLite/Capacitor Preferences plus export backup; do not change before first native proof |
| Lee-Lee legacy records/plans | `localStorage` keys listed at `js/levi-diabetes-tracker.js:10-21` | Legacy records/plans | Critical until verified | Preserve | Migration source | Safe if untouched | Preserve until Supabase data verified and backup exists |
| Lee-Lee sync queue | `localStorage` key `lando-world:lee-lees-tracker:sync-queue:v1` (`js/lee-lees-tracker-sync.js:6`, `js/lee-lees-tracker-sync.js:83-89`) | Pending record writes | Critical | Yes | Upload queue | Good pattern, storage medium can improve later | Keep queue semantics; eventually simplify |
| Lee-Lee conflicts | `localStorage` key `lando-world:lee-lees-tracker:sync-conflicts:v1` (`js/lee-lees-tracker-sync.js:7`, `js/lee-lees-tracker-sync.js:91-97`) | Conflict records | Critical | Yes | No, conflict state local | Safe | Keep until simplified architecture validated |
| Lee-Lee shared settings | `localStorage` keys `shared-settings-cache`, `shared-settings-queue`, `shared-settings-migration` (`js/lee-lees-tracker-sync.js:8-10`) | Patient/clinic cache, queue, migration state | Critical | Yes | Yes via Supabase | Safe | Keep until simplified |
| Lee-Lee device identity | `localStorage` key `lando-world:lee-lees-tracker:device-identity:v1` (`js/lee-lees-tracker-sync.js:4`, `js/lee-lees-tracker-sync.js:57-65`) | Device label | Medium | Yes | No | Safe | Move to native Preferences later |
| Lee-Lee backups | Blob download + `localStorage` backup timestamps/preserved backups (`js/levi-diabetes-tracker.js:1040-1068`, `js/levi-diabetes-tracker.js:1135-1139`) | JSON backup/export metadata | Critical safety feature | Yes for preserved snapshots | No | Download UX needs native share/files testing | Use Capacitor Filesystem/Share later |
| Violet Sprints | `localStorage` key `violet_sprints_workouts_v1` (`js/sprints-app.js:2`, `js/sprints-app.js:517-526`) | Workouts | Medium | Yes | No | Safe | Keep local; native Preferences or file backup later |
| Violet Sprints flags | `localStorage` keys at `js/sprints-app.js:4-5` | Install prompt and seeded workout flags | Low | Yes | No | Safe | Native runtime should ignore PWA install prompt flag |
| Road Bike Checklist | `localStorage` key `lando-world:road-bike-trip-checklist:v1` (`js/road-bike-checklist.js:2`, `js/road-bike-checklist.js:128-165`) | Checked item IDs and version | Low/medium | Yes | No | Safe | Keep localStorage for first native |
| PWA Manager | `localStorage` keys `landos_world_install_dismissed_v1`, `landos_world_storage_persist_requested_v1` (`js/pwa-manager.js:2-3`) | Install/storage prompt state | Low | Web only | No | Not needed native | Disable PWA manager service-worker/install behavior native |
| Cache API | `service-worker.js`, `js/pwa-manager.js` | App shell/runtime/weather/font/image caches | Web PWA critical | Yes after SW install | No | Not a native shell dependency | Web only |

No `sessionStorage`, IndexedDB, or cookies are used directly in application code. Supabase Auth internally persists sessions in browser storage because `persistSession: true` is set.

## F. Lee-Lee's Tracker Audit

### Authentication Model

- The tracker uses Supabase password auth through `signInWithPassword` at `js/lee-lees-tracker-sync.js:534-549`.
- It checks an existing session with `client.auth.getSession()` at `js/lee-lees-tracker-sync.js:505`.
- It subscribes to auth state changes at `js/lee-lees-tracker-sync.js:507-519`.
- It signs out local session scope at `js/lee-lees-tracker-sync.js:552-558`.
- Password reset uses `resetPasswordForEmail` with `redirectTo = ${location.origin}${location.pathname}` at `js/lee-lees-tracker-sync.js:561-566`.

Native concern: password auth can work in Capacitor WebView, but password reset redirects need a native-aware URL strategy. `location.origin + location.pathname` may produce a Capacitor origin that Supabase does not accept or cannot route back into the app.

### Supabase Client Initialization

- Config global: `window.LEE_LEES_TRACKER_SUPABASE_CONFIG` in `js/lee-lees-tracker-config.js:4-7`.
- Client library source: CDN import at `js/lee-lees-tracker-sync.js:3` and `js/lee-lees-tracker-sync.js:50-54`.
- Client options: `persistSession`, `autoRefreshToken`, and `detectSessionInUrl` at `js/lee-lees-tracker-sync.js:488-493`.

Native concern: bundle the Supabase client locally. Test localStorage-backed sessions in Capacitor and consider a future custom storage adapter if needed.

### Tables and RPC Calls

Tables:

- `lee_lee_records` (`js/lee-lees-tracker-sync.js:13`)
- `lee_lee_shared_settings` (`js/lee-lees-tracker-sync.js:14`)

Database schema:

- Records table with UUID primary key, owner `user_id`, record details, version, soft-delete metadata, migration/import fingerprints, payload JSON (`supabase/migrations/202608030001_create_lee_lee_tracker_records.sql:5-33`).
- Unique indexes on migration and import fingerprints (`supabase/migrations/202608030001_create_lee_lee_tracker_records.sql:42-48`).
- Version-aware record RPC `update_lee_lee_record_with_version` (`supabase/migrations/202608030001_create_lee_lee_tracker_records.sql:68-154`).
- Shared settings table (`supabase/migrations/202608040001_create_lee_lee_shared_settings.sql:5-17`).
- Version-aware shared settings RPC (`supabase/migrations/202608040001_create_lee_lee_shared_settings.sql:37-87`).

Remote calls:

- Insert records at `js/lee-lees-tracker-sync.js:640-644`.
- Update/soft-delete/restore records through RPC at `js/lee-lees-tracker-sync.js:661-662`.
- Reconcile records with full select by user at `js/lee-lees-tracker-sync.js:733-740`.
- Fetch shared settings at `js/lee-lees-tracker-sync.js:753-762`.
- Insert/update shared settings at `js/lee-lees-tracker-sync.js:855-912`.

### Local Storage and Queue

Primary local document:

- `TRACKER_STORAGE_KEY = 'lando-world:lee-lees-tracker:v1'` at `js/levi-diabetes-tracker.js:2`.
- Records, settings, insulin plans, recovery metadata are normalized at `js/levi-diabetes-tracker.js:575-638`.
- Legacy keys are merged on load at `js/levi-diabetes-tracker.js:719-737`.

Sync keys:

- Device identity, metadata, queue, conflicts, shared settings cache/queue/migration at `js/lee-lees-tracker-sync.js:4-12`.

Queue behavior:

- `queueUpsert`, `queueSoftDelete`, and `queueRestore` create pending operations at `js/lee-lees-tracker-sync.js:587-627`.
- `processQueue` exits when offline or already processing (`js/lee-lees-tracker-sync.js:629-632`).
- Pending queue survives reload through localStorage (`js/lee-lees-tracker-sync.js:83-89`).
- Online event retries at `js/lee-lees-tracker-sync.js:1197-1200`.
- Visibility refresh and periodic reconciliation run at `js/lee-lees-tracker-sync.js:1201-1212`.

Conflict handling:

- Duplicate insert can merge if same content, otherwise registers conflict (`js/lee-lees-tracker-sync.js:645-653`).
- Versioned update returning no row registers conflict (`js/lee-lees-tracker-sync.js:661-667`).
- Conflicts stored in localStorage (`js/lee-lees-tracker-sync.js:717-731`).
- UI supports keep shared/use local, including bulk behavior (`js/levi-diabetes-tracker.js:909-1038`).
- Identical conflicts can auto-resolve (`js/lee-lees-tracker-sync.js:1034-1062`).

Deleted records and restore:

- Database has no delete policy; deletion is soft-delete (`supabase/migrations/202608030001_create_lee_lee_tracker_records.sql:156-164`).
- App queues soft delete at `js/levi-diabetes-tracker.js:3398-3417`.
- Restore clears `deletedAt/deletedBy` and queues restore at `js/levi-diabetes-tracker.js:3425-3442`.
- Recently deleted UI appears in settings (`js/levi-diabetes-tracker.js:2764-2784`).

Device identity:

- Values are `Rolando`, `Emily`, `Unknown` at `js/lee-lees-tracker-sync.js:15`.
- Stored separately from auth account at `js/lee-lees-tracker-sync.js:57-65`.
- UI asks who uses the device at `js/levi-diabetes-tracker.js:885-907`.

Settings synchronization:

- Patient/clinic info uses shared settings table and version-aware RPC.
- Device identity and history window stay local.
- Shared settings migration prompt and upload flow exist at `js/levi-diabetes-tracker.js:2494-2523` and `js/levi-diabetes-tracker.js:3768-3780`.

Export/print:

- JSON full backup at `js/levi-diabetes-tracker.js:1040-1068`.
- CSV export at `js/lee-lees-tracker-sync.js:1162-1195`.
- Browser print/PDF flow at `js/levi-diabetes-tracker.js:1961` and `js/levi-diabetes-tracker.js:3851-3852`.

Startup/loading:

- Local storage is loaded immediately (`js/levi-diabetes-tracker.js:68-70`).
- Sync repository is created at `js/levi-diabetes-tracker.js:3547-3561`.
- App initialization initializes repository and current sync status at `js/levi-diabetes-tracker.js:3636-3643`.
- Protected app requires configured sync, signed-in session, and device identity (`js/levi-diabetes-tracker.js:3583-3595`).

### Safest Transition to Simpler Native Architecture

Target model:

- Supabase remains authoritative shared history.
- Native/local storage is an offline cache and pending-write queue.
- New entries save locally immediately.
- Pending writes retry automatically.
- Writes are idempotent via stable UUID and/or operation IDs.
- Conflict handling is minimal and visible.
- Legacy browser migration UI is retired only after data verification.

Recommended transition:

1. Freeze current web behavior and add native shell/bundle first.
2. Bundle Supabase JS locally and prove current sync works in Capacitor unchanged.
3. Verify Supabase remote data completeness against local backup exports.
4. Add a data audit screen or script that compares local active/deleted record counts, date ranges, migration fingerprints, and Supabase rows.
5. Only after verification, hide legacy migration prompts for native users who have no unmigrated local-only data.
6. Replace the multiple localStorage sync/migration keys with one compact native storage document:
   - `recordsCache`
   - `pendingWrites`
   - `syncMetadata`
   - `deviceIdentity`
   - `conflicts`
7. Preserve export/import until after TestFlight validation.

Do not remove legacy keys or migration UI before a successful native build and data safety checkpoint.

## G. Supabase + Capacitor Readiness

Likely to work:

- Supabase REST calls from a Capacitor WebView with network access.
- Password auth with persisted session if WebView localStorage is durable.
- RLS model because it is auth-user scoped.
- Reconciliation on app resume via `visibilitychange`.
- Pending local queue retries when `online` fires.

Needs modification or testing:

- CDN import must be replaced or bundled (`js/lee-lees-tracker-sync.js:3`).
- Password reset redirect must become native-aware (`js/lee-lees-tracker-sync.js:564-565`).
- Supabase allowed redirect URLs currently document only GitHub Pages (`docs/SUPABASE_SETUP.md:103-106`).
- `detectSessionInUrl: true` should be tested with any native deep-link flow.
- Auth session persistence should be tested across app kill/relaunch, iOS low-storage conditions, and app updates.
- Realtime websockets should be tested on foreground/background transitions.
- `navigator.onLine` can be unreliable; Capacitor Network plugin is better for native sync state.
- Background sync is not guaranteed; queue should process on app foreground/resume.

## H. Light/Dark Theme Audit

Existing theme system:

- `css/app-themes.css:1-82` provides app accent tokens.
- It does not provide semantic surface/text/border tokens.
- No stored theme preference was found.
- No `prefers-color-scheme` implementation was found.
- `index.html:22` sets static black `theme-color`.

Current dark-mode support:

- Most apps are effectively dark-only.
- Digital Clock, launcher, Weather, Lee-Lee's Tracker, Violet Sprints, Road Bike Checklist, and Daily Chief Briefing all use hardcoded dark backgrounds and light text.
- Print styles in Lee-Lee's Tracker intentionally switch to white (`css/levi-diabetes.css:853-899`).

Most difficult areas:

- Digital Clock/launcher shared CSS because it doubles as global shell styling.
- Lee-Lee's Tracker because it has the largest CSS file and many status colors, forms, reports, sheets, and print rules.
- Weather and Sprints because their identities are strongly baked into dark gradients.

Recommended semantic token system:

```css
:root {
  color-scheme: light dark;
  --color-bg: ...;
  --color-surface: ...;
  --color-surface-elevated: ...;
  --color-text: ...;
  --color-text-secondary: ...;
  --color-border: ...;
  --color-accent: ...;
  --color-success: ...;
  --color-warning: ...;
  --color-danger: ...;
}

[data-appearance="light"] { ... }
[data-appearance="dark"] { ... }
@media (prefers-color-scheme: dark) {
  [data-appearance="system"] { ... }
}
```

Migration approach:

1. Add shell-level appearance state only: system/light/dark.
2. Map each app's existing accent token to `--color-accent`.
3. Replace global body/shell colors first.
4. Migrate one app at a time, starting with Road Bike Checklist or Weather.
5. Preserve app accent identities:
   - Weather: yellow/Tour de France accent.
   - Lee-Lee's Tracker: blue accent.
   - Violet Sprints: purple accent.
   - Road Bike Checklist: current raspberry accent.
   - Digital Clock: current green/digital identity.

## I. Mobile / iOS UI Audit

Good existing work:

- Viewport meta exists at `index.html:6`.
- Shared safe-area variables exist at `css/digital-clock.css:16-21`.
- Shared ecosystem nav is sticky and accounts for top safe area at `css/digital-clock.css:55-63`.
- Fixed PWA status/toast account for bottom/right safe areas at `css/digital-clock.css:424-460`.
- Road Bike and Sprints custom confirm overlays account for all safe areas (`css/road-bike-checklist.css:239-245`, `css/sprints.css:420-425`).
- Touch targets often meet 44px+ minimums.

Likely iPhone WebView issues:

- `min-height: 100vh` appears in `css/digital-clock.css:12`, `css/digital-clock.css:33`, `css/road-bike-checklist.css:42`, and several Sprints surfaces. Some are mitigated with `100dvh`, but not uniformly.
- Lee-Lee history sheet uses fixed bottom positioning at `css/levi-diabetes.css:243-265` without explicit safe-area bottom padding in the snippet audited.
- Dialogs and sheets with focused inputs must be tested with the native keyboard, especially Lee-Lee sign-in and record editor.
- Weather uses very large responsive type for temperature (`css/weather-app.css:113-120`), which needs small-device verification.
- PWA toasts/status should be hidden or repurposed in native because they can overlap the home indicator or native status UX.
- Hover states exist in CSS; focus-visible mostly exists, but touch-only UX should be verified.

Recommendations:

- Standardize `min-height: 100dvh` with `100vh` fallback for full-height native surfaces.
- Add native safe-area wrapper rules for top, bottom, left, and right.
- Add bottom padding to all fixed sheets and action bars with `env(safe-area-inset-bottom)`.
- Use Capacitor Keyboard plugin to add/remove a keyboard-visible class if forms are obscured.
- Use Capacitor StatusBar to coordinate translucent/opaque status bar with shell colors.
- Test portrait first; Sprints landscape timer already has special handling but needs device screenshots.
- Keep `prefers-reduced-motion` rules and extend them for timer animations if needed.

## J. Native Feature Opportunity Audit

| Capacitor/native API | Classification | Why |
|---|---|---|
| Network | Useful for first native release | More reliable than `navigator.onLine` for sync/weather/offline UI |
| App lifecycle | Useful for first native release | Trigger sync/reconcile on foreground and pause timers cleanly |
| StatusBar | Useful for first native release | Safe status bar color/contrast in light/dark/system modes |
| SplashScreen | Useful for first native release | Smooth bundled-shell launch |
| Keyboard | Useful for first native release | Prevent Lee-Lee forms/sheets being obscured |
| Browser/App Launcher | Useful for first native release | Open Death on Notecards, footer, source links externally |
| Preferences | Nice-to-have later | Good for settings/device identity, but avoid storage migration before first build |
| Filesystem | Nice-to-have later | Better JSON backup/import storage |
| Share | Nice-to-have later | Export backup/CSV/PDF via native share sheet |
| Haptics | Nice-to-have later | Timer/checklist/tracker feedback |
| Local Notifications | Nice-to-have later | Timer/sprints or reminder opportunities, not needed initially |
| Secure Storage | Nice-to-have later | Supabase session/security hardening if required |

Do not install plugins before the static bundle and path/runtime split are ready.

## K. Build Pipeline Audit

Current state:

- `package.json` exists.
- Scripts only run syntax checks and tests (`package.json:6-9`).
- Dependency: `openai` for backend API (`package.json:10-12`).
- No `dist/`, `build/`, `www/`, Vite, Webpack, or Capacitor config found.
- No `ios/` or `android/` directory found.
- `vercel.json` configures API function duration only.
- GitHub Pages deployment currently assumes root static files.

Recommended simplest build architecture:

- Do not introduce React, Vite, or Webpack for the first native milestone.
- Add a small Node copy script later, for example `scripts/build-static.mjs`, that copies:
  - `index.html`
  - `css/`
  - `js/`
  - `icons/`
  - `fonts/`
  - icon/manifest files as appropriate
  - `service-worker.js` only for web bundle, or copy but do not register in native
- Exclude:
  - `node_modules/`
  - `.pnpm-store/`
  - `.git/`
  - `DigitalClockBlazor/`
  - `tests/`
  - `docs/`
  - `api/` from native client bundle unless intentionally required
  - Supabase SQL migrations

Eventual Capacitor `webDir`:

- Prefer `www` if following Capacitor defaults, or `dist/native` if using separate web/native bundle outputs.
- For this project, `www` is simplest once generated and gitignored or intentionally committed.

Preserving GitHub Pages:

- Keep root static files as the GitHub Pages source.
- Add a separate native copy step that produces `www/`.
- Do not move `index.html` during Stage 1.
- Do not change existing production paths until a copy/build step can validate both web and native outputs.

## L. Capacitor Readiness Plan

### Stage 0: Repository Audit and Safety Baseline

Objective: Establish current architecture, storage, PWA, URL, and native risks.  
Files likely affected: `NATIVE_READINESS_AUDIT.md` only.  
Risk level: Low.  
Validation: `git status`, `git diff --stat`, `git diff -- NATIVE_READINESS_AUDIT.md`.  
Rollback: Delete the audit file.

### Stage 1: Build Pipeline / Native-Ready Web Output

Objective: Create a minimal static copy pipeline for native bundle output.  
Files likely affected: `package.json`, `scripts/build-static.mjs`, `.gitignore`, possibly `www/` or `dist/native/`.  
Risk level: Medium because packaging mistakes can omit assets.  
Validation: compare copied asset list to service-worker precache and HTML references; run local static server from output; run tests.  
Rollback: remove script/output and restore `package.json`.

### Stage 2: Path and Navigation Normalization

Objective: Preserve GitHub Pages paths while making runtime paths native-safe.  
Files likely affected: `manifest.webmanifest`, `index.html`, `index-digital-clock.html`, build script.  
Risk level: Medium.  
Validation: GitHub Pages-style local serve under root and generated bundle under native output; verify `#/digital-clock`, `#/weather`, legacy redirect, assets, icons.  
Rollback: revert path/runtime changes; keep hash routing.

### Stage 3: Shared Appearance / Light-Dark Foundation

Objective: Add system/light/dark appearance state and semantic tokens without redesigning apps.  
Files likely affected: `css/digital-clock.css`, `css/app-themes.css`, `index.html`, a small settings/appearance JS module.  
Risk level: Medium/high because visual regressions are easy.  
Validation: screenshot each route in system/light/dark, test readable contrast, test stored preference.  
Rollback: remove appearance preference and semantic token mappings.

### Stage 4: Capacitor Installation and iOS Project Generation

Objective: Add Capacitor using existing static bundle, generate iOS project.  
Files likely affected: `package.json`, `package-lock.json` or `pnpm-lock.yaml`, `capacitor.config.*`, `ios/`.  
Risk level: Medium.  
Validation: `npx cap sync ios`, open in Xcode, run simulator, verify app shell.  
Rollback: remove Capacitor deps/config/ios project.

### Stage 5: Offline-Native Startup Verification

Objective: Confirm airplane-mode launch renders shell and local apps from bundled files.  
Files likely affected: runtime detection/service-worker guard, build script.  
Risk level: High if service worker/CDN assumptions remain.  
Validation: install on simulator/device, kill app, enable airplane mode, launch, open Digital Clock/Road Bike/Sprints/Lee-Lee local UI/Weather offline state.  
Rollback: restore web-only PWA behavior and native bundle guard.

### Stage 6: Supabase Auth and LLT Sync Validation

Objective: Prove current Lee-Lee sync works in Capacitor without simplifying yet.  
Files likely affected: Supabase client loading, auth redirect config, docs.  
Risk level: High because medical records are critical.  
Validation: sign in, create record online, create record offline, relaunch, reconnect, verify Supabase row and second-device sync, test soft delete/restore/conflict.  
Rollback: keep native build but disable shared sync until fixed; no data deletion.

### Stage 7: LLT Storage/Sync Simplification

Objective: Replace legacy migration-heavy flow with simple cache/pending-write architecture after data verification.  
Files likely affected: `js/levi-diabetes-tracker.js`, `js/lee-lees-tracker-sync.js`, tests, docs.  
Risk level: Critical.  
Validation: full backup before/after, remote row count/date range/fingerprint audit, offline queue tests, conflict tests, migration prompt removal tests.  
Rollback: keep old keys untouched; re-enable legacy flow.

### Stage 8: Native iOS Polish and Safe Areas

Objective: Make the app feel native and reliable on iPhone.  
Files likely affected: CSS safe-area rules, Capacitor config, optional plugins.  
Risk level: Medium.  
Validation: device screenshots for iPhone SE, standard iPhone, Dynamic Island models; keyboard tests; orientation tests for Sprints.  
Rollback: remove plugin-specific polish and retain web layout.

### Stage 9: TestFlight Readiness

Objective: Prepare signing, icons, privacy, entitlement, and release checklist.  
Files likely affected: `ios/`, app icons/splash, privacy manifest if needed, docs.  
Risk level: Medium/high due App Store/TestFlight requirements.  
Validation: archive in Xcode, upload to App Store Connect, internal TestFlight install, airplane-mode smoke, Lee-Lee data test.  
Rollback: keep GitHub Pages app as production fallback.

## M. Risk Report

### CRITICAL

Issue: Lee-Lee's Tracker medical data relies on complex localStorage plus Supabase migration/sync state.  
Consequence: A premature simplification could lose, duplicate, or hide medical records.  
Files: `js/levi-diabetes-tracker.js`, `js/lee-lees-tracker-sync.js`, `supabase/migrations/*`.  
Resolution: Do not simplify until native build works and local/Supabase data completeness is verified with backups.

Issue: Supabase client is loaded from CDN.  
Consequence: Shared sync/auth cannot initialize without internet and violates true local bundle expectations.  
Files: `js/lee-lees-tracker-sync.js:3`, `js/lee-lees-tracker-sync.js:50-54`.  
Resolution: Bundle Supabase JS locally in Stage 1/2 before Capacitor validation.

### HIGH

Issue: PWA first-launch offline is not guaranteed.  
Consequence: A user can install/open web PWA but fail offline if the service-worker precache never completed.  
Files: `service-worker.js:145-160`, `js/pwa-manager.js:330-380`.  
Resolution: Native must bundle files and disable service-worker reliance.

Issue: Manifest and shortcuts are GitHub Pages absolute paths.  
Consequence: Bad paths in native or non-GitHub hosted contexts.  
Files: `manifest.webmanifest:4-83`.  
Resolution: Keep web manifest; generate native-safe bundle metadata or omit manifest dependency native.

Issue: Password reset redirects use current origin/path.  
Consequence: Supabase reset flow may not return correctly to native app.  
Files: `js/lee-lees-tracker-sync.js:561-566`, `docs/SUPABASE_SETUP.md:103-106`.  
Resolution: Define native deep link/universal link strategy before TestFlight.

Issue: No build output or copy manifest exists.  
Consequence: Capacitor setup would either point at root source or accidentally bundle docs/tests/backend/generated files.  
Files: `package.json`, repo root.  
Resolution: Add minimal static bundle step first.

### MEDIUM

Issue: Theme is dark-only with scattered hardcoded colors.  
Consequence: Light Mode/system appearance requirement is not met.  
Files: `css/*.css`, `index.html:22`.  
Resolution: Add semantic tokens and appearance setting after bundle/path baseline.

Issue: Native safe-area support is partial.  
Consequence: notch/Dynamic Island/home indicator/keyboard overlap on some views.  
Files: `css/digital-clock.css`, `css/levi-diabetes.css`, `css/weather-app.css`, `css/sprints.css`, `css/road-bike-checklist.css`.  
Resolution: Standardize safe-area wrappers and test device screenshots.

Issue: Daily Chief Briefing same-origin backend inference is web-host oriented.  
Consequence: Native app may point to a meaningless Capacitor origin for generation.  
Files: `js/daily-chief-briefing.js:144-150`.  
Resolution: Require explicit backend URL in native or disable generation until configured.

Issue: External links are normal anchors.  
Consequence: Native WebView may navigate away from the app shell.  
Files: `index.html:68`, `index.html:386`, `js/daily-chief-briefing.js:914`.  
Resolution: Add external-link handling for native runtime.

### LOW

Issue: Footer uses `http://rolandobernal.github.io`.  
Consequence: Non-secure external link and possible WebView warning.  
Files: `index.html:68`.  
Resolution: Change to `https` in a later web-safe cleanup.

Issue: `DigitalClockBlazor/` remains in repo.  
Consequence: Could be accidentally included in native bundle if copying too broadly.  
Files: `DigitalClockBlazor/*`.  
Resolution: Explicit include-list copy script.

Issue: PWA install prompt flags are irrelevant native.  
Consequence: Minor dead UI/state if PWA manager runs native.  
Files: `js/pwa-manager.js`.  
Resolution: Guard web-only PWA behavior.

## N. Final Recommendation

1. Is the current Lando's World architecture a good candidate for Capacitor?  
   **Yes.** Static vanilla HTML/CSS/JS plus hash routing is a strong fit.

2. Is a framework rewrite necessary?  
   **No.** A rewrite would add risk without solving the main native-readiness issues.

3. What is the biggest blocker?  
   The missing native-ready static bundle/runtime split, especially service-worker and path assumptions.

4. What is the biggest data-safety concern?  
   Lee-Lee's Tracker's critical medical records and complex migration/sync state.

5. What is the biggest offline concern?  
   The app currently relies on completed PWA precache for web offline launch, while native must bundle shell files directly. Supabase sync also depends on a CDN-loaded client today.

6. What is the biggest iOS UI concern?  
   Safe-area/keyboard behavior in fixed sheets, dialogs, and full-height views, especially Lee-Lee's Tracker.

7. What should we change before installing Capacitor?  
   Add a minimal static bundle output, add native/web runtime detection, make service-worker registration web-only, bundle Supabase locally, and normalize path assumptions.

8. What should remain untouched until after the first native build works?  
   Lee-Lee's Tracker storage/sync simplification, Supabase schema changes, UI redesign, and theme refactor beyond minimal runtime-safe foundations.

9. What should the first implementation sprint contain?  
   Static bundle pipeline, web/native runtime guard, service-worker native disablement, local Supabase client bundling, and a native offline startup smoke checklist.

10. Is there anything in the current codebase that makes this migration unusually risky?  
    The only unusually risky area is Lee-Lee's Tracker because it stores critical medical data and has legacy migration, conflict, soft-delete, shared settings, and pending queue behavior. The rest of the app is comparatively straightforward for Capacitor.

## Verification Requested for This Audit

Before finishing, run:

```sh
git status
git diff --stat
git diff -- NATIVE_READINESS_AUDIT.md
```

Expected result: `NATIVE_READINESS_AUDIT.md` is the only new or modified repository file.
