# ADR - Incremental History Loading Without Pagination

Lee-Lee's Tracker History should stay simple after months or years of records without introducing numbered pages.

## Decision

History uses an incremental date-window model:

- Show the newest date groups first.
- Use the user's History Initial Window preference for the first render.
- Append older date groups with Load Older Records.
- Reset the visible window whenever filters change.

The default initial window is 30 days.

## Why Not Numbered Pagination

Numbered pages are a poor fit for a chronological medical log because the user usually thinks in dates, not page numbers. A Load Older Records action keeps the mental model simple: recent history first, then older days as needed.

## Data Flow

History keeps filtering and loading separate:

1. Start with the hydrated tracker records.
2. Apply date and entry-type filters.
3. Group records by local event date from `recordTimestamp`.
4. Sort date groups newest first.
5. Apply the visible date-window.
6. Render the date cards.

Grouping utilities do not know about incremental loading. This keeps future virtualization possible without changing the record selectors.

## Filter Sheet

History filters are edited in a bottom sheet. Draft filter changes do not affect the list until Apply is selected. Cancel leaves current filters unchanged. Clear Filters restores All Records and All Entry Types.

## Performance

Daily summaries are memoized by a stable record-group key. Export report builders are registered separately from Export screen rendering so additional report types can be added later without creating new persistent data structures.

## Persistence

This feature does not change the tracker storage document. History remains a derived view over `lando-world:lee-lees-tracker:v1`.
