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
