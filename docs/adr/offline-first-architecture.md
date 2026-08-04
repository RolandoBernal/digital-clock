# ADR: Offline First Architecture

## Status

Accepted

## Context

Lando's World is evolving from a static website into a personal app ecosystem. The launcher, Digital Clock, Lee-Lee's Tracker, Violet Sprints, Weather, Daily Chief Briefing, and future apps should continue to open reliably when the device has no network connection.

The project is deployed to GitHub Pages and does not use a client build step for the shell. Lee-Lee's Tracker stores sensitive medical records locally. Cache cleanup must never delete those records.

## Decision

Use a production service worker with separate versioned caches for application files and runtime network data.

Application cache and user data remain permanently separate:

- Application cache uses the Cache Storage API and cache names beginning with `landos-world-`.
- User data remains in localStorage and existing app storage modules.
- Service-worker cache cleanup deletes only Cache Storage entries with the Lando's World prefix.
- Service-worker code never calls `localStorage.clear()`, opens IndexedDB, or deletes medical records.

The app shell uses cache-first behavior. Weather uses stale while revalidate. Runtime documents and future API responses choose strategies by use case.

## Consequences

The launcher can load offline after one successful online load.

Local apps continue working offline because their HTML, CSS, JavaScript, icons, and fonts are precached.

Weather and Daily Chief Briefing can display cached weather while offline and refresh automatically when the network returns.

New deployments install in the background and notify the user only when a restart is available.

Cross-scope apps cannot be fully controlled by this service worker after navigation leaves Lando's World's GitHub Pages scope. Death on Notecards should eventually own its own offline-first architecture if it must be fully installable and offline on its own.

## Alternatives Considered

Caching everything forever was rejected because it hides stale deployments and makes cache recovery harder.

Network first for the entire app shell was rejected because it makes offline launch fragile.

Clearing all browser storage was rejected because it could erase Lee-Lee's Tracker records and other user data.

Adding a build-time PWA plugin was rejected for now because the current codebase is intentionally static and GitHub Pages friendly.
