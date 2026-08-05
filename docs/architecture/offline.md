# Offline Architecture

Lando's World is designed as an offline-first Progressive Web App. The launcher and every local application should feel native after the app has loaded successfully once.

## Offline Philosophy

The app shell loads first, local user data loads second, and online services load third. Losing network access should not block navigation, settings, Digital Clock, Lee-Lee's Tracker, Violet Sprints, or the launcher.

Weather and future online services are allowed to be stale while offline. They should show cached information with a clear offline note instead of replacing content with large errors.

## Manifest

`manifest.webmanifest` defines `Lando's World` with the short name `Lando`, standalone display, black background/theme colors, portrait-primary orientation, GitHub Pages start/scope URLs, install icons, and app shortcuts.

The manifest is intentionally static and does not require a build step.

## Service Worker

`service-worker.js` owns application caching only. It uses versioned cache names:

- `landos-world-app-*` for the application shell and precached static files.
- `landos-world-runtime-*` for same-origin runtime documents/assets.
- `landos-world-weather-*` for Open-Meteo responses.
- `landos-world-images-*` for runtime images.
- `landos-world-fonts-*` for fonts.

Old application caches are cleaned during activation. User data is not part of any service-worker cache and is never deleted by cache cleanup.

## Caching Strategy

App shell: cache first. `index.html`, the legacy `index-digital-clock.html` redirect, CSS, JavaScript, local fonts, manifest, and icons are precached.

Static assets: cache first. Local CSS, JavaScript, SVG, PNG, and font files should continue loading offline.

Weather: stale while revalidate. Cached forecasts display immediately; online refreshes update the weather cache in the background.

Future APIs: use a strategy per service. User-facing data that can become stale should prefer stale while revalidate. Actions that must be fresh should use network first with a cached fallback only when safe.

## Offline Behavior

Launcher: loads from the app cache, including cards, icons, theme, footer, and navigation.

Digital Clock: works offline. Time and date are computed locally. Current weather tiles show the last locally cached forecast when available.

Weather: opens offline and displays the last downloaded forecast with an offline note.

Daily Chief Briefing: opens offline and uses stored briefing data plus cached weather when available.

Lee-Lee's Tracker: works offline from localStorage. Records, settings, insulin plans, history, export, and pending sync state are application data, not cache data.

Violet Sprints: works offline from cached JavaScript/CSS and localStorage.

Death on Notecards: the launcher and icon are cached. The external GitHub Pages app can be cached when opened from Lando's World while online, but its own offline completeness depends on that separate app's deployment and service-worker scope.

## Online and Offline Indicator

`js/pwa-manager.js` listens for `online` and `offline` events. The status pill stays hidden when online and ready, and appears when useful, especially offline.

When the connection returns, the PWA manager asks Weather and Daily Chief Briefing to refresh online data without interrupting the user.

## Install Flow

When `beforeinstallprompt` is supported, the app stores the event and shows a small install prompt. If the user dismisses it, the dismissal is remembered in localStorage so the app does not nag.

iOS Safari does not expose `beforeinstallprompt`; users still install through Add to Home Screen.

## Update Flow

New deployments install silently in the background. If a new service worker is waiting, the app shows a small "Update available" message with a Restart button.

Restart sends `SKIP_WAITING` to the waiting service worker and reloads the page after the new worker becomes active. Local app data is not cleared.

## Settings

The Digital Clock settings toolbar includes an Offline section with:

- Application Installed.
- Offline Ready.
- Last Cache Update.
- Storage Used when the browser exposes it.
- Clear Application Cache.

Clear Application Cache removes only caches whose names start with `landos-world-`. It does not clear localStorage, IndexedDB, or medical records.

## Storage Separation

Application cache and user data are permanently separate.

Application cache lives in the Cache Storage API and is owned by `service-worker.js`.

User data lives in localStorage and existing app storage abstractions, including Lee-Lee's Tracker records and settings. Service-worker cleanup never calls `localStorage.clear()`, never opens IndexedDB, and never deletes medical records.

## Browser Support

Modern Chromium browsers, Safari, Firefox, iOS Safari, iPadOS Safari, macOS, Android, and Windows can use the static app shell. Install prompts vary by browser.

Storage persistence via `navigator.storage.persist()` is attempted once where supported and ignored where unsupported.

Storage usage via `navigator.storage.estimate()` is displayed where supported.

## GitHub Pages

The service worker is registered relative to the deployed path and uses relative precache URLs. Hash routing remains compatible with GitHub Pages because routes are stored after `#`.

`index.html` is the GitHub Pages entrypoint for Lando's World. The legacy `index-digital-clock.html` page preserves search and hash state while redirecting to the root hash router.

## Known Limitations

The first offline launch requires one successful online load so the service worker can install and precache assets.

Cross-scope applications, including Death on Notecards, cannot be fully controlled by Lando's World's service worker after navigation leaves the Lando's World scope.

Weather can only refresh while online. Offline weather is the last downloaded forecast.

Service-worker updates are browser controlled; exact timing varies by browser.

## Recovery Procedures

If the app shell appears stale, use the Update Available Restart button when shown.

If cached files appear corrupted, open Digital Clock settings and choose Clear Application Cache. The page reloads and downloads fresh application files when online.

If Lee-Lee's Tracker data appears missing, do not clear browser site data. Cache cleanup does not delete records, so inspect localStorage/app backup flows first.
