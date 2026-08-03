# ADR - Durable Local Persistence for Lee-Lee's Tracker

Lee-Lee's Tracker stores medical log data in browser `localStorage` under one stable key:

`lando-world:lee-lees-tracker:v1`

Application deployments must never clear or replace Lee-Lee's Tracker records.

## Stored Document

The stored document uses `schemaVersion: 1` and contains:

- `records`
- `settings`
- `insulinPlans`
- `activeInsulinPlanId`
- `recovery`
- `metadata.createdAt`
- `metadata.updatedAt`

Record timestamps are serialized as ISO 8601 strings. Unknown record fields are preserved during load and save so future schema fields are not silently dropped.

## Hydration

Startup reads the stable document first, validates it, migrates older data, hydrates in-memory state, then renders. The app does not initialize an empty record list and save it before storage has loaded.

## Writes

All durable changes go through the tracker repository functions in `js/levi-diabetes-tracker.js`:

- `loadTrackerData()`
- `saveTrackerData(data)`
- `updateTrackerData(updater)`
- `mergeTrackerDocuments(baseData, incomingData)`

Each update starts from the latest stored document, applies the change, writes the full document, and then updates in-memory state. If a save fails, the in-memory data remains visible and the UI shows a retryable warning.

## Migrations

Legacy record data is merged from known older keys, including `levi_diabetes_records_v1`. Legacy insulin plans are merged from `levi_diabetes_insulin_plans_v1`.

Legacy keys are left intact during migration. Records are deduplicated by ID first, then by a conservative composite identity when no ID is available. Malformed records are preserved in `recovery.malformedRecords` instead of causing the whole database to be discarded.

## Backup And Restore

Settings includes local JSON backup export and import. Import previews record and insulin-plan counts, requires confirmation, creates a pre-import backup under `lando-world:lee-lees-tracker:v1:pre-import-backup:*`, then merges without duplicating records.

No tracker data is sent to a server.

## Deployment And Service Workers

GitHub Pages deployments, asset-version changes, service-worker cache cleanup, and route changes must not change the storage key and must not remove tracker data. Cache cleanup is separate from application-data cleanup.

## Multi-Tab Behavior

The tracker listens for browser `storage` events for the stable key. When another tab writes newer tracker data, this tab reloads and merges the document safely instead of overwriting it with stale state.

## Browser Limitations

`localStorage` persists across refreshes, browser restarts, tab close/reopen, navigation, and ordinary deployments on the same browser and origin. It can still be lost if the user clears site data, uses private browsing that discards storage, changes browsers or devices, changes origin, or loses/resets the device. Export backups regularly.

## Development Inspection

To inspect stored data without modifying it, open browser developer tools on the Lando's World origin and read:

```js
JSON.parse(localStorage.getItem('lando-world:lee-lees-tracker:v1'))
```

Do not use `localStorage.clear()` during normal development or deployment testing.
