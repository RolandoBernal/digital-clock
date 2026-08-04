# Lee-Lee's Tracker Supabase Setup

This guide connects Lee-Lee's Tracker to the existing Supabase project while keeping the app hosted on GitHub Pages.

## Safe Values

The frontend may use only these browser-safe values:

- Project URL
- Publishable key, also called the anon key in some Supabase screens

Never place these in frontend code, Git, logs, screenshots, or chat:

- `service_role` key
- Database password
- Supabase Management API token
- Any private JWT secret

## 1. Find The Project URL And Publishable Key

1. Open Supabase.
2. Choose organization `Lando's World`.
3. Choose project `lee-lee-tracker`.
4. Open Project Settings, then API.
5. Copy the Project URL.
6. Copy the publishable/anon key.

## 2. Configure The Browser App

For local testing, edit `js/lee-lees-tracker-config.js` on your machine:

```js
window.LEE_LEES_TRACKER_SUPABASE_CONFIG = {
  url: 'https://YOUR-PROJECT.supabase.co',
  publishableKey: 'YOUR-PUBLISHABLE-KEY',
};
```

Keep `.env`, `.env.local`, and real credential files out of Git. `.env.example` contains placeholders only.

For a future build-injection workflow, these names are reserved:

```sh
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

## 3. Apply The Database Migration

Use either the SQL Editor or Supabase CLI.

SQL Editor:

1. Open Supabase SQL Editor.
2. Open `supabase/migrations/202608030001_create_lee_lee_tracker_records.sql`.
3. Paste the full file.
4. Run it.

Supabase CLI:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migration creates `public.lee_lee_records`, useful indexes, optimistic concurrency fields, soft-delete fields, attribution fields, RLS policies, and Realtime publication registration.

## 4. Confirm RLS

In Supabase Table Editor:

1. Open `lee_lee_records`.
2. Confirm Row Level Security is enabled.
3. Confirm policies exist for authenticated select, insert, and update.
4. Confirm there are no anonymous read/write policies.

The policies restrict every row to `user_id = auth.uid()`.

## 5. Create The Shared App Account

1. Open Authentication, then Users.
2. Create one email/password account for Lee-Lee's Tracker.
3. Use that same account on both iPhones.

Rolando and Emily are device labels, not separate Supabase accounts.

## 6. Configure Auth Redirect URLs

Set the Site URL to the GitHub Pages app URL.

Use this pattern unless the repository Pages URL differs:

```text
https://rolandobernal.github.io/digital-clock/
```

Add the same URL to Allowed Redirect URLs. If password reset is used, Supabase should redirect back to the same app URL.

## 7. Enable Realtime

The SQL migration attempts to add `lee_lee_records` to `supabase_realtime`. In Supabase, confirm Realtime is enabled for the table. The app also performs full reconciliation on launch, resume, reconnect, manual sync, and periodic refresh, so Realtime is an enhancement rather than the only sync path.

## 8. Test With Two Devices

1. Open the app in one browser/device.
2. Sign in with the shared account.
3. Choose `Rolando` for this device.
4. Open the app in a second browser/device.
5. Sign in with the same shared account.
6. Choose `Emily` for that device.
7. Add a test record with non-real medical values.
8. Confirm it syncs to the other device.

## 9. Legacy Local Data

Existing localStorage records are not deleted automatically. Before any migration, create a JSON backup from Settings.

The app keeps local data as:

- Local cache
- Pending sync queue
- Safety backup source
- Recovery fallback

## 10. Rollback

To return to the current local-only code:

1. Check out the previous Git commit before this feature branch.
2. Leave browser localStorage untouched.
3. Do not delete Supabase rows unless you are certain they are test data.

The migration is additive and does not drop old localStorage keys or database objects.
