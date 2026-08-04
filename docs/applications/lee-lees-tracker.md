# Lee-Lee's Tracker

Lee-Lee's Tracker is a local-first blood-sugar and insulin log inside Lando's World. It now supports Supabase-backed shared records for a single shared family account used on Rolando's and Emily's devices.

## Navigation

The tracker has four in-app sections:

- Today
- History
- Export
- Settings

All sections read from the same normalized tracker document. Supabase is the authoritative shared source after sign-in. Browser storage remains the local cache, offline queue, safety backup layer, and recovery fallback.

## Authentication & Device Identity

The tracker is protected behind email/password Supabase sign-in. Both phones use the same shared app account.

Each device also stores a local label:

- Rolando
- Emily
- Unknown

That label is written as record attribution (`enteredBy`, `lastEditedBy`, and `deletedBy`). It is not a separate Supabase identity.

## Synchronization

Records save locally first, then queue a remote operation. Sync runs:

- After record create, edit, soft delete, or restore
- On authenticated app load
- When the page becomes visible
- When the browser comes back online
- Periodically while open
- Through Supabase Realtime while available
- When the user taps Sync Now

Sync status is intentionally compact: Saved, Syncing, Synced, Offline, Waiting to sync, Sync problem, or Conflict needs review.

Patient and clinic information uses a separate shared-settings sync path backed by `public.lee_lee_shared_settings`. It is still local-first in the browser, but it syncs independently from glucose and insulin records.

## History

History reviews active saved records without creating a separate history store. Records are grouped by the local calendar date derived from `recordTimestamp`, which is the actual event time for the blood-sugar reading or insulin dose.

Date groups are sorted newest first. Records inside a day are sorted oldest first so the day reads from morning through overnight.

History supports:

- Date range filters: last 7 days, last 14 days, last 30 days, all records, custom range
- Entry type filters: all supported entry types
- Opening an existing record in the shared record editor
- Deleting a record after explicit confirmation

## History Filters

History uses a compact Filters button with a short summary above the date list, such as `13 Days - 36 Entries` or `1 Day - 1 Entry`. On small screens the filters open in a bottom sheet. Filter selections are drafted in the sheet and apply only when the user chooses Apply.

Clear Filters restores All Records and All Entry Types.

## Incremental History Loading

History avoids numbered pagination. When it opens, it renders the newest date groups first using the configured initial window. The Load Older Records button appends the next window of older date groups while preserving scroll position.

Filtering, grouping, sorting, and visible-window selection are separate steps:

1. Filter records.
2. Group by local `recordTimestamp` date.
3. Sort date groups newest first.
4. Render the visible window.
5. Load older groups on request.

Changing filters resets the visible window so older results from a previous filter are not mixed into the new view.

## History Preferences

Settings includes History Initial Window:

- 7 Days
- 14 Days
- 30 Days
- 60 Days
- All Records

The default is 30 Days. This preference affects only the initial History view. It does not affect Export ranges or stored records.

## Daily Summary

Each History day detail calculates:

- Entry count from all records in that day
- Average blood sugar from records with valid blood-sugar values
- Highest blood sugar from records with valid blood-sugar values
- Lowest blood sugar from records with valid blood-sugar values
- Total insulin from actual administered insulin only

Missing insulin is not treated as zero. Suggested insulin is never included in the actual insulin total.

## Export

Export provides an on-screen printable preview and uses the browser print dialog for printing or saving as PDF. No medical data is emailed automatically.

Export supports:

- Today
- Last 7 days
- Last 14 days
- Last 30 days
- Custom date range

The default export range is last 7 days.

## Report Builder Architecture

Export uses a small report registry. Each report declares an ID, title, description, builder, and print layout. The current registered reports are Clinical Log and Detailed Report.

This keeps future report types, such as weekly summaries or dose review reports, isolated from the Export screen. Those future reports are not implemented yet.

## Clinical Log

The Clinical Log is a compact table with one row per date. It includes paired blood-sugar and insulin columns for:

- Breakfast
- Lunch
- Dinner
- Bedtime
- 2 AM

If multiple records of the same primary type or additional checks exist on a day, the earliest primary record appears in the main cells and the remaining records appear in the Notes column as additional checks. Every selected record appears somewhere in the report.

## Detailed Report

The Detailed Report groups records by date and displays every record individually with:

- Time
- Entry type
- Blood sugar
- Actual insulin given
- Suggested dose details when available
- Insulin plan name or identifier when available
- Notes

Actual administered insulin is always the primary insulin value. Suggested insulin is secondary context only.

## CSV Export

Settings includes a CSV export for human-readable review. It excludes deleted records by default and includes local display date/time, record type, glucose, insulin, notes, attribution, created time, and updated time. CSV is not a restore format.

## Print Behavior

Print styles hide Lando's World navigation, filters, buttons, and other controls. The printable report uses a white background, high-contrast text, semantic tables, and page-break rules that avoid splitting related report sections where possible.

## Settings Metadata

Settings may optionally store patient and clinic fields for report headers:

- Patient name
- Date of birth
- Clinic name
- Clinic phone

These patient and clinic fields sync across signed-in devices after the user confirms shared-settings upload or saves them while signed in.

The following settings intentionally remain local to each device:

- This device is used by
- History Initial Window
- Local migration metadata
- Backup reminder state
- Auth/session state

## Recently Deleted

Delete is a soft delete. Deleted records are hidden from normal Today, History, and Export views, but remain available in Settings under Recently Deleted. Restore clears deletion metadata and queues a restore operation for Supabase.

## Conflict Review

If another device edits the same record first, the local pending edit is not allowed to silently overwrite it. The record is marked for review. Settings can open the conflict review screen, where the user can keep the shared version or explicitly use this device's version.

Before showing the review list, conflicts with identical user-visible values are resolved automatically in favor of the shared canonical row. The review screen supports selecting entries, Select All, Select None, Bulk Keep Shared, and Bulk Use This Device. Bulk Use This Device still rebases each selected item onto the latest shared version through the same optimistic-concurrency path as individual conflict resolution.

Patient and clinic settings conflicts are labeled separately as Patient & Clinic Settings and use the same Keep Shared / Use This Device choices.

## Manual Test Checklist

1. Configure Supabase with `docs/SUPABASE_SETUP.md`.
2. Sign in locally with the shared app account.
3. Choose Rolando as this device.
4. Sign in from another browser/device with the same account.
5. Choose Emily as that device.
6. Add a non-real test record on one device.
7. Confirm it appears on the other device.
8. Add separate records on both devices close together.
9. Confirm both remain.
10. Edit the same record from both devices.
11. Confirm conflict review appears.
12. Select multiple conflicts and confirm bulk Keep Shared or bulk Use This Device preserves unresolved failures.
13. Delete and restore a record.
14. Turn on airplane mode, add a record or edit Patient & Clinic, close and reopen, reconnect, and confirm it syncs once.
15. Export a JSON backup.
16. Preview/import that same JSON and confirm it does not duplicate records.
17. Export CSV and verify escaping for commas, quotes, and line breaks.
18. Verify existing localStorage data is still present before any production migration.

## Legacy Compatibility

Older records remain compatible through the tracker migration layer. When a record is missing newer fields, the app falls back to `recordTimestamp`, then `date` and `time`, then legacy `timestamp`. Legacy `insulinUnits` is treated as the actual administered insulin value.

## Privacy

Tracker data syncs only to the configured Supabase project after authentication. The frontend uses no service-role key, database password, or privileged Supabase credential.

## Known Limitations

The current reporting flow relies on the browser print dialog. Users can save as PDF from that dialog, but the app does not generate a standalone PDF file itself. Long-term analytics, charts, CGM-style reporting, and automatic clinic sharing are intentionally out of scope.
