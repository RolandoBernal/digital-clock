# Lee-Lee's Tracker

Lee-Lee's Tracker is a local-first blood-sugar and insulin log inside Lando's World.

## Navigation

The tracker has four in-app sections:

- Today
- History
- Export
- Settings

All sections read from the same durable tracker document stored in browser `localStorage`.

## History

History reviews saved records without creating a separate history store. Records are grouped by the local calendar date derived from `recordTimestamp`, which is the actual event time for the blood-sugar reading or insulin dose.

Date groups are sorted newest first. Records inside a day are sorted oldest first so the day reads from morning through overnight.

History supports:

- Date range filters: last 7 days, last 14 days, last 30 days, all records, custom range
- Entry type filters: all supported entry types
- Opening an existing record in the shared record editor
- Deleting a record after explicit confirmation

## History Filters

History uses a compact Filters button with a short summary above the date list, such as `All Records - All Entries` or `Last 30 days - Breakfast`. On small screens the filters open in a bottom sheet. Filter selections are drafted in the sheet and apply only when the user chooses Apply.

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

Export provides an on-screen printable preview and uses the browser print dialog for printing or saving as PDF. No medical data is uploaded or emailed automatically.

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

## Print Behavior

Print styles hide Lando's World navigation, filters, buttons, and other controls. The printable report uses a white background, high-contrast text, semantic tables, and page-break rules that avoid splitting related report sections where possible.

## Settings Metadata

Settings may optionally store local patient and clinic fields for report headers:

- Patient name
- Date of birth
- Clinic name
- Clinic phone

These fields remain on the device and are omitted from reports when blank.

## Legacy Compatibility

Older records remain compatible through the tracker migration layer. When a record is missing newer fields, the app falls back to `recordTimestamp`, then `date` and `time`, then legacy `timestamp`. Legacy `insulinUnits` is treated as the actual administered insulin value.

## Privacy

History and Export are local-only derived views. The app does not send tracker records, report contents, insulin values, blood-sugar values, notes, or patient details to a server.

## Known Limitations

The current reporting flow relies on the browser print dialog. Users can save as PDF from that dialog, but the app does not generate a standalone PDF file itself. Long-term analytics, charts, CGM-style reporting, cloud sync, and automatic clinic sharing are intentionally out of scope.
