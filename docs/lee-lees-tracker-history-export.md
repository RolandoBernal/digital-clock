# ADR - Derived History and Local Printable Reports

Lee-Lee's Tracker History and Export are derived views over the same persisted tracker document used by Today.

They do not maintain separate record arrays, separate history storage, or separate export storage.

## Decision

History and Export derive their data at render time from the hydrated tracker document stored under:

`lando-world:lee-lees-tracker:v1`

The shared reporting helpers in `js/lee-lee-diabetes-tracker.js` handle:

- Event timestamp resolution
- Local event-date grouping
- Date-range filtering
- Entry-type filtering
- Chronological sorting
- Daily summary calculations
- Clinical Log row building
- Detailed Report grouping

## Timestamp Rule

All History and Export grouping, sorting, filtering, and display use `recordTimestamp`. If an older record lacks `recordTimestamp`, the app falls back to the stored `date` and `time`, then legacy `timestamp`.

`createdAt` and `updatedAt` are internal metadata and are not used for History or Export chronology.

## Actual Versus Suggested Insulin

Actual administered insulin is always the primary insulin value. Suggested insulin appears only as secondary context. Summary totals use actual administered insulin only.

## Print Strategy

Version 1 uses `window.print()` and dedicated CSS under `@media print`. This keeps reporting local to the browser and lets the user print or save as PDF through the native print dialog.

## Privacy

No report data is uploaded, emailed, synchronized, or sent to analytics. Printing and manual PDF saving are initiated by the user.

## Future Work

The derived helper structure leaves room for pagination, virtualization, richer analytics, or additional report formats without changing the persisted record model.
