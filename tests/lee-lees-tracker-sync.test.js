import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const syncSource = readFileSync(new URL('../js/lee-lees-tracker-sync.js', import.meta.url), 'utf8');
const migrationSource = readFileSync(
  new URL('../supabase/migrations/202608030001_create_lee_lee_tracker_records.sql', import.meta.url),
  'utf8',
);
const sharedSettingsMigrationSource = readFileSync(
  new URL('../supabase/migrations/202608040001_create_lee_lee_shared_settings.sql', import.meta.url),
  'utf8',
);

function createLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    dump: () => Object.fromEntries(store),
  };
}

function createSyncContext({ localStorage = createLocalStorage(), supabase = null, config = null } = {}) {
  const context = {
    Date,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    URL,
    console,
    crypto: {
      randomUUID: () => `uuid-${Math.random().toString(36).slice(2)}`,
    },
    document: {
      visibilityState: 'visible',
    },
    localStorage,
    navigator: {
      onLine: true,
    },
    window: null,
    globalThis: null,
  };
  context.window = context;
  context.globalThis = context;
  if (config) context.LEE_LEE_TRACKER_SUPABASE_CONFIG = config;
  if (supabase) context.supabase = supabase;
  vm.runInNewContext(syncSource, context);
  return context;
}

function record(overrides = {}) {
  return {
    id: 'record-1',
    type: 'Breakfast',
    bloodSugar: 198,
    insulinUnits: 5,
    administeredInsulinUnits: 5,
    notes: 'Eggs, "toast", and juice',
    recordTimestamp: '2026-08-01T12:42:00.000Z',
    createdAt: '2026-08-01T12:45:00.000Z',
    updatedAt: '2026-08-01T12:45:00.000Z',
    version: 1,
    enteredBy: 'Rolando',
    ...overrides,
  };
}

function createDocumentStore(initial = { records: [] }) {
  let document = {
    schemaVersion: 1,
    records: initial.records || [],
    settings: {},
    insulinPlans: [],
    metadata: {},
  };
  return {
    getDocument: () => document,
    saveDocument: (nextDocument) => {
      document = nextDocument;
      return { ok: true, data: document };
    },
    mergeDocuments: (base, incoming) => ({
      ...base,
      records: [...new Map([...base.records, ...incoming.records].map((item) => [item.id, item])).values()],
    }),
    normalizeRecord: (item) => ({ ...item }),
  };
}

function createMockSupabase(remoteRows = [], options = {}) {
  const rows = [...remoteRows];
  const sharedSettingsRows = [...(options.sharedSettingsRows || [])];
  const rpcCalls = [];
  const userId = options.userId || 'user-1';
  const client = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: userId } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: () => Promise.resolve({ data: { session: { user: { id: userId } } } }),
      signOut: () => Promise.resolve({}),
      resetPasswordForEmail: () => Promise.resolve({}),
    },
    from(tableName) {
      const tableRows = tableName === 'lee_lee_shared_settings' ? sharedSettingsRows : rows;
      const builder = {
        insert(payload) {
          const index = tableName === 'lee_lee_shared_settings'
            ? tableRows.findIndex((row) => row.user_id === payload.user_id)
            : tableRows.findIndex((row) => row.id === payload.id);
          if (index >= 0) {
            builder.error = { code: '23505', message: 'duplicate key value violates unique constraint' };
            builder.current = null;
            return builder;
          }
          tableRows.push({
            ...payload,
            version: payload.version || 1,
            created_at: payload.client_created_at || '2026-08-01T12:45:00.000Z',
            updated_at: payload.client_created_at || '2026-08-01T12:45:00.000Z',
          });
          builder.current = tableName === 'lee_lee_shared_settings'
            ? tableRows.find((row) => row.user_id === payload.user_id)
            : tableRows.find((row) => row.id === payload.id);
          return builder;
        },
        select() {
          return builder;
        },
        single() {
          if (builder.error) return Promise.resolve({ data: null, error: builder.error });
          return Promise.resolve({ data: builder.current, error: null });
        },
        maybeSingle() {
          const row = tableName === 'lee_lee_shared_settings'
            ? tableRows.find((item) => item.user_id === builder.filters?.user_id)
            : tableRows.find((item) => item.id === builder.filters?.id);
          if (!row) {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: row, error: null });
        },
        eq(column, value) {
          builder.filters = { ...(builder.filters || {}), [column]: value };
          return builder;
        },
        order() {
          return Promise.resolve({ data: tableRows, error: null });
        },
      };
      return builder;
    },
    rpc(name, args) {
      rpcCalls.push({ name, args });
      if (name === 'update_lee_lee_shared_settings_with_version') {
        const row = sharedSettingsRows.find((item) => item.user_id === userId);
        if (!row || Number(row.version) !== Number(args.p_expected_version)) {
          return Promise.resolve({ data: null, error: null });
        }
        Object.assign(row, {
          patient_name: args.p_patient_name,
          patient_date_of_birth: args.p_patient_date_of_birth,
          clinic_name: args.p_clinic_name,
          clinic_phone: args.p_clinic_phone,
          last_edited_by: args.p_last_edited_by,
          payload: args.p_payload,
          app_schema_version: args.p_app_schema_version,
          version: Number(row.version) + 1,
          updated_at: '2026-08-01T13:15:00.000Z',
        });
        return Promise.resolve({ data: row, error: null });
      }
      if (name !== 'update_lee_lee_record_with_version') {
        return Promise.resolve({ data: null, error: { message: 'unknown rpc' } });
      }
      const row = rows.find((item) => item.id === args.p_id && item.user_id === userId);
      if (!row || Number(row.version) !== Number(args.p_expected_version)) {
        return Promise.resolve({ data: null, error: null });
      }
      Object.assign(row, {
        record_type: args.p_record_type,
        blood_sugar: args.p_blood_sugar,
        insulin_units: args.p_insulin_units,
        administered_insulin_units: args.p_administered_insulin_units,
        suggested_base_units: args.p_suggested_base_units,
        suggested_correction_units: args.p_suggested_correction_units,
        suggested_total_units: args.p_suggested_total_units,
        insulin_plan_id: args.p_insulin_plan_id,
        insulin_plan_snapshot: args.p_insulin_plan_snapshot,
        dose_calculation_status: args.p_dose_calculation_status,
        notes: args.p_notes,
        recorded_at: args.p_recorded_at,
        entered_by: args.p_entered_by,
        last_edited_by: args.p_last_edited_by,
        deleted_at: args.p_deleted_at,
        deleted_by: args.p_deleted_by,
        source: args.p_source,
        client_created_at: args.p_client_created_at,
        migration_fingerprint: args.p_migration_fingerprint,
        import_fingerprint: args.p_import_fingerprint,
        app_schema_version: args.p_app_schema_version,
        payload: args.p_payload,
        version: Number(row.version) + 1,
        updated_at: '2026-08-01T13:15:00.000Z',
      });
      return Promise.resolve({ data: row, error: null });
    },
    channel() {
      return {
        on() {
          return this;
        },
        subscribe(callback) {
          callback?.('SUBSCRIBED');
          return this;
        },
      };
    },
    removeChannel() {},
    rows,
    sharedSettingsRows,
    rpcCalls,
  };
  return { createClient: () => client, client };
}

test('reports missing Supabase config without throwing', () => {
  const context = createSyncContext();
  assert.equal(context.LeeLeeTrackerSync.getConfig().configured, false);
});

test('device identity is persisted locally', () => {
  const context = createSyncContext();
  context.LeeLeeTrackerSync.setDeviceIdentity('Emily');
  assert.equal(context.LeeLeeTrackerSync.getDeviceIdentity(), 'Emily');
});

test('new record queues locally and uploads through Supabase once initialized', async () => {
  const supabase = createMockSupabase();
  const context = createSyncContext({
    supabase,
    config: { url: 'https://example.supabase.co', publishableKey: 'publishable-key-for-browser-tests-123' },
  });
  context.navigator.onLine = false;
  const store = createDocumentStore({ records: [record()] });
  const repository = context.LeeLeeTrackerSync.createRepository(store);

  await repository.initialize();
  assert.equal(repository.getSyncStatus().signedIn, true);
  repository.setDeviceIdentity('Rolando');
  repository.queueUpsert(record({ id: 'local-first' }), null);
  context.navigator.onLine = true;
  await repository.processQueue();

  assert.equal(supabase.client.rows.some((row) => row.id === 'local-first'), true);
  assert.equal(repository.getSyncStatus().pendingCount, 0);
});

test('same-record stale update creates a conflict instead of overwriting', async () => {
  const supabase = createMockSupabase([{
    id: 'record-1',
    user_id: 'user-1',
    record_type: 'Breakfast',
    blood_sugar: 205,
    insulin_units: 5,
    administered_insulin_units: 5,
    notes: 'Eggs, "toast", and juice',
    recorded_at: '2026-08-01T12:42:00.000Z',
    client_created_at: '2026-08-01T12:45:00.000Z',
    created_at: '2026-08-01T12:45:00.000Z',
    updated_at: '2026-08-01T13:00:00.000Z',
    version: 2,
    entered_by: 'Emily',
    payload: record({ bloodSugar: 205, version: 2, enteredBy: 'Emily' }),
  }]);
  const context = createSyncContext({
    supabase,
    config: { url: 'https://example.supabase.co', publishableKey: 'publishable-key-for-browser-tests-123' },
  });
  context.navigator.onLine = false;
  const store = createDocumentStore({ records: [record({ version: 1 })] });
  const repository = context.LeeLeeTrackerSync.createRepository(store);

  await repository.initialize();
  repository.queueUpsert(record({ version: 1, bloodSugar: 198 }), record({ version: 1 }));
  context.navigator.onLine = true;
  await repository.processQueue();
  assert.equal(repository.getConflicts().length, 1);
  assert.equal(supabase.client.rows[0].blood_sugar, 205);
  assert.equal(supabase.client.rpcCalls[0].name, 'update_lee_lee_record_with_version');
  assert.equal(supabase.client.rpcCalls[0].args.p_expected_version, 1);
});

test('two clients updating the same base version produce one update and one conflict', async () => {
  const supabase = createMockSupabase([{
    id: 'record-1',
    user_id: 'user-1',
    record_type: 'Breakfast',
    blood_sugar: 180,
    insulin_units: 5,
    administered_insulin_units: 5,
    notes: 'Eggs, "toast", and juice',
    recorded_at: '2026-08-01T12:42:00.000Z',
    client_created_at: '2026-08-01T12:45:00.000Z',
    created_at: '2026-08-01T12:45:00.000Z',
    updated_at: '2026-08-01T12:45:00.000Z',
    version: 1,
    entered_by: 'Rolando',
    payload: record({ bloodSugar: 180, version: 1 }),
  }]);
  const context = createSyncContext({
    supabase,
    config: { url: 'https://example.supabase.co', publishableKey: 'publishable-key-for-browser-tests-123' },
  });
  context.navigator.onLine = false;
  const store = createDocumentStore({ records: [record({ version: 1, bloodSugar: 180 })] });
  const repository = context.LeeLeeTrackerSync.createRepository(store);

  await repository.initialize();
  repository.queueUpsert(record({ version: 1, bloodSugar: 190 }), record({ version: 1, bloodSugar: 180 }));
  repository.queueUpsert(record({ version: 1, bloodSugar: 210 }), record({ version: 1, bloodSugar: 180 }));
  context.navigator.onLine = true;
  await repository.processQueue();

  assert.equal(supabase.client.rows[0].blood_sugar, 190);
  assert.equal(supabase.client.rows[0].version, 2);
  assert.equal(repository.getConflicts().length, 1);
  assert.equal(repository.getConflicts()[0].localRecord.bloodSugar, 210);
  assert.deepEqual(supabase.client.rpcCalls.map((call) => call.args.p_expected_version), [1, 1]);
});

test('soft delete and restore use version-matched RPC updates that increment once', async () => {
  const supabase = createMockSupabase([{
    id: 'record-1',
    user_id: 'user-1',
    record_type: 'Breakfast',
    blood_sugar: 180,
    insulin_units: 5,
    administered_insulin_units: 5,
    notes: 'Eggs, "toast", and juice',
    recorded_at: '2026-08-01T12:42:00.000Z',
    client_created_at: '2026-08-01T12:45:00.000Z',
    created_at: '2026-08-01T12:45:00.000Z',
    updated_at: '2026-08-01T12:45:00.000Z',
    version: 1,
    entered_by: 'Rolando',
    payload: record({ bloodSugar: 180, version: 1 }),
  }]);
  const context = createSyncContext({
    supabase,
    config: { url: 'https://example.supabase.co', publishableKey: 'publishable-key-for-browser-tests-123' },
  });
  context.navigator.onLine = false;
  const store = createDocumentStore({ records: [record({ version: 1, bloodSugar: 180 })] });
  const repository = context.LeeLeeTrackerSync.createRepository(store);

  await repository.initialize();
  repository.setDeviceIdentity('Emily');
  repository.queueSoftDelete(record({ version: 1, bloodSugar: 180 }));
  context.navigator.onLine = true;
  await repository.processQueue();

  assert.equal(Boolean(supabase.client.rows[0].deleted_at), true);
  assert.equal(supabase.client.rows[0].deleted_by, 'Emily');
  assert.equal(supabase.client.rows[0].version, 2);

  context.navigator.onLine = false;
  repository.queueRestore(record({
    version: 2,
    bloodSugar: 180,
    deletedAt: supabase.client.rows[0].deleted_at,
    deletedBy: 'Emily',
  }));
  context.navigator.onLine = true;
  await repository.processQueue();

  assert.equal(supabase.client.rows[0].deleted_at, null);
  assert.equal(supabase.client.rows[0].deleted_by, null);
  assert.equal(supabase.client.rows[0].version, 3);
  assert.deepEqual(supabase.client.rpcCalls.map((call) => call.args.p_expected_version), [1, 2]);
});

test('conflict resolution using local version applies against the latest shared version', async () => {
  const supabase = createMockSupabase([{
    id: 'record-1',
    user_id: 'user-1',
    record_type: 'Breakfast',
    blood_sugar: 205,
    insulin_units: 5,
    administered_insulin_units: 5,
    notes: '',
    recorded_at: '2026-08-01T12:42:00.000Z',
    client_created_at: '2026-08-01T12:45:00.000Z',
    created_at: '2026-08-01T12:45:00.000Z',
    updated_at: '2026-08-01T13:00:00.000Z',
    version: 2,
    entered_by: 'Emily',
    payload: record({ bloodSugar: 205, version: 2, enteredBy: 'Emily' }),
  }]);
  const context = createSyncContext({
    supabase,
    config: { url: 'https://example.supabase.co', publishableKey: 'publishable-key-for-browser-tests-123' },
  });
  context.navigator.onLine = false;
  const store = createDocumentStore({ records: [record({ version: 1 })] });
  const repository = context.LeeLeeTrackerSync.createRepository(store);

  await repository.initialize();
  repository.queueUpsert(record({ version: 1, bloodSugar: 198 }), record({ version: 1 }));
  context.navigator.onLine = true;
  await repository.processQueue();
  assert.equal(repository.getConflicts().length, 1);

  await repository.useLocalVersion('record-1');

  assert.equal(repository.getConflicts().length, 0);
  assert.equal(supabase.client.rows[0].blood_sugar, 198);
  assert.equal(supabase.client.rows[0].version, 3);
  assert.deepEqual(supabase.client.rpcCalls.map((call) => call.args.p_expected_version), [1, 2]);
});

test('shared settings insert for authenticated user and sync to a second client', async () => {
  const supabase = createMockSupabase();
  const config = { url: 'https://example.supabase.co', publishableKey: 'publishable-key-for-browser-tests-123' };
  const firstContext = createSyncContext({ supabase, config });
  const secondContext = createSyncContext({ supabase, config });
  const first = firstContext.LeeLeeTrackerSync.createRepository(createDocumentStore());
  const second = secondContext.LeeLeeTrackerSync.createRepository(createDocumentStore());

  await first.initialize();
  first.setDeviceIdentity('Rolando');
  first.saveSharedSettings({
    patientName: 'Lee',
    patientBirthDate: '2026-07-31',
    clinicName: 'Care Team',
    clinicPhone: '555-0100',
  });
  await first.processSharedSettingsQueue();
  await second.initialize();

  assert.equal(supabase.client.sharedSettingsRows.length, 1);
  assert.equal(second.getSharedSettings().patientName, 'Lee');
  assert.equal(second.getSharedSettingsStatus().hasRemote, true);
});

test('shared settings stale version creates a conflict and preserves local version', async () => {
  const supabase = createMockSupabase([], {
    sharedSettingsRows: [{
      user_id: 'user-1',
      patient_name: 'Shared',
      patient_date_of_birth: '2026-07-31',
      clinic_name: 'Shared Clinic',
      clinic_phone: '555-0100',
      version: 2,
      last_edited_by: 'Emily',
      payload: {},
    }],
  });
  const context = createSyncContext({
    supabase,
    config: { url: 'https://example.supabase.co', publishableKey: 'publishable-key-for-browser-tests-123' },
  });
  context.navigator.onLine = false;
  const repository = context.LeeLeeTrackerSync.createRepository(createDocumentStore());

  await repository.initialize();
  repository.saveSharedSettings({
    patientName: 'Local',
    patientBirthDate: '2026-07-31',
    clinicName: 'Local Clinic',
    clinicPhone: '555-0199',
    version: 1,
  });
  context.navigator.onLine = true;
  await repository.processSharedSettingsQueue();

  const conflict = repository.getConflicts().find((item) => item.entityType === 'shared-settings');
  assert.equal(Boolean(conflict), true);
  assert.equal(conflict.localRecord.patientName, 'Local');
  assert.equal(conflict.sharedRecord.patientName, 'Shared');
});

test('offline shared settings queue survives reload and syncs exactly once', async () => {
  const localStorage = createLocalStorage();
  const supabase = createMockSupabase();
  const config = { url: 'https://example.supabase.co', publishableKey: 'publishable-key-for-browser-tests-123' };
  const firstContext = createSyncContext({ localStorage, supabase, config });
  firstContext.navigator.onLine = false;
  const first = firstContext.LeeLeeTrackerSync.createRepository(createDocumentStore());

  await first.initialize();
  first.saveSharedSettings({ patientName: 'Lee' });
  assert.equal(first.getSharedSettingsStatus().pendingCount, 1);

  const secondContext = createSyncContext({ localStorage, supabase, config });
  const second = secondContext.LeeLeeTrackerSync.createRepository(createDocumentStore());
  await second.initialize();
  await second.processSharedSettingsQueue();

  assert.equal(supabase.client.sharedSettingsRows.length, 1);
  assert.equal(second.getSharedSettingsStatus().pendingCount, 0);
});

test('shared settings migration metadata is separate from medical-record migration metadata', () => {
  const context = createSyncContext();
  const repository = context.LeeLeeTrackerSync.createRepository(createDocumentStore());

  repository.setSharedSettingsMigration({ prompted: true, dismissedAt: '2026-08-04T12:00:00.000Z' });

  assert.equal(repository.getSharedSettingsMigration().prompted, true);
  assert.notEqual(repository.keys.sharedSettingsMigration, repository.keys.migration);
  assert.equal(repository.sharedSettingsHaveValues({ patientName: 'Lee' }), true);
});

test('sync repository exposes a read-only record queue snapshot for migration resume checks', () => {
  assert.match(syncSource, /function getRecordQueueSnapshot\(\)/);
  assert.match(syncSource, /getRecordQueueSnapshot,/);
  assert.match(syncSource, /recordId: operation\.recordId/);
  assert.match(syncSource, /lastErrorCategory: operation\.lastErrorCategory/);
});

test('identical conflicts are auto-resolved while meaningful differences remain', async () => {
  const supabase = createMockSupabase([{
    id: 'same-content',
    user_id: 'user-1',
    record_type: 'Breakfast',
    blood_sugar: 180,
    insulin_units: 5,
    administered_insulin_units: 5,
    notes: 'Eggs, "toast", and juice',
    recorded_at: '2026-08-01T12:42:00.000Z',
    client_created_at: '2026-08-01T12:45:00.000Z',
    created_at: '2026-08-01T12:45:00.000Z',
    updated_at: '2026-08-01T13:00:00.000Z',
    version: 2,
    entered_by: 'Emily',
    payload: record({ id: 'same-content', bloodSugar: 180, version: 2, enteredBy: 'Emily' }),
  }, {
    id: 'different-content',
    user_id: 'user-1',
    record_type: 'Breakfast',
    blood_sugar: 205,
    insulin_units: 5,
    administered_insulin_units: 5,
    notes: '',
    recorded_at: '2026-08-01T12:42:00.000Z',
    client_created_at: '2026-08-01T12:45:00.000Z',
    created_at: '2026-08-01T12:45:00.000Z',
    updated_at: '2026-08-01T13:00:00.000Z',
    version: 2,
    entered_by: 'Emily',
    payload: record({ id: 'different-content', bloodSugar: 205, version: 2, enteredBy: 'Emily' }),
  }]);
  const context = createSyncContext({
    supabase,
    config: { url: 'https://example.supabase.co', publishableKey: 'publishable-key-for-browser-tests-123' },
  });
  context.navigator.onLine = false;
  const repository = context.LeeLeeTrackerSync.createRepository(createDocumentStore());

  await repository.initialize();
  repository.queueUpsert(record({ id: 'same-content', version: 1, bloodSugar: 180 }), record({ id: 'same-content', version: 1 }));
  repository.queueUpsert(record({ id: 'different-content', version: 1, bloodSugar: 198 }), record({ id: 'different-content', version: 1 }));
  context.navigator.onLine = true;
  await repository.processQueue();

  assert.equal(repository.getConflicts().length, 2);
  assert.equal(repository.cleanupIdenticalConflicts(), 1);
  assert.equal(repository.getConflicts().length, 1);
  assert.equal(repository.getConflicts()[0].recordId, 'different-content');
});

test('JSON import preview flags same UUID with different content as a conflict', () => {
  const context = createSyncContext();
  const store = createDocumentStore();
  const repository = context.LeeLeeTrackerSync.createRepository(store);
  const preview = repository.previewJsonImport({
    appIdentifier: 'lee-lee-tracker-full-backup',
    records: [record({ id: 'same-id', bloodSugar: 220 })],
  }, [record({ id: 'same-id', bloodSugar: 180 })]);

  assert.equal(preview.summary.conflictingRecords.length, 1);
  assert.equal(preview.summary.newRecords.length, 0);
  assert.equal(preview.summary.identicalRecords.length, 0);
});

test('CSV export escapes quotes, commas, and line breaks', () => {
  const context = createSyncContext();
  const store = createDocumentStore();
  const repository = context.LeeLeeTrackerSync.createRepository(store);
  const csv = repository.exportCsv([{ ...record(), notes: 'Line one,\nLine "two"' }]);

  assert.match(csv, /"Line one,\nLine ""two"""/);
  assert.match(csv, /"Entered By"/);
});

test('SQL migration blocks direct updates and leaves writes to the versioned RPC', () => {
  const rpcMigrationBlock = migrationSource.match(
    /create or replace function public\.update_lee_lee_record_with_version[\s\S]*?grant execute on function public\.update_lee_lee_record_with_version/,
  )?.[0] || '';
  assert.match(migrationSource, /references auth\.users\(id\) on delete restrict/);
  assert.match(migrationSource, /security definer/);
  assert.match(migrationSource, /set search_path = ''/);
  assert.match(migrationSource, /current_user_id := auth\.uid\(\)/);
  assert.match(migrationSource, /if current_user_id is null then/);
  assert.match(migrationSource, /and user_id = current_user_id/);
  assert.match(migrationSource, /and version = p_expected_version/);
  assert.match(migrationSource, /version = public\.lee_lee_records\.version \+ 1/);
  assert.doesNotMatch(rpcMigrationBlock, /updated_at\s*=/);
  assert.match(migrationSource, /revoke update, delete on public\.lee_lee_records from authenticated, anon, public/);
  assert.match(migrationSource, /grant select, insert on public\.lee_lee_records to authenticated/);
  assert.doesNotMatch(migrationSource, /grant select, insert, update on public\.lee_lee_records to authenticated/);
  assert.match(migrationSource, /grant execute on function public\.update_lee_lee_record_with_version[\s\S]*to authenticated/);
  assert.match(migrationSource, /revoke all on function public\.update_lee_lee_record_with_version[\s\S]*from public, anon/);
  assert.match(migrationSource, /-- Intentionally no DELETE policy\./);
});

test('shared settings SQL migration uses RLS and version-aware RPC only', () => {
  const rpcMigrationBlock = sharedSettingsMigrationSource.match(
    /create or replace function public\.update_lee_lee_shared_settings_with_version[\s\S]*?grant execute on function public\.update_lee_lee_shared_settings_with_version/,
  )?.[0] || '';

  assert.match(sharedSettingsMigrationSource, /create table if not exists public\.lee_lee_shared_settings/);
  assert.match(sharedSettingsMigrationSource, /user_id uuid primary key references auth\.users\(id\) on delete restrict/);
  assert.match(sharedSettingsMigrationSource, /security definer/);
  assert.match(sharedSettingsMigrationSource, /set search_path = ''/);
  assert.match(sharedSettingsMigrationSource, /current_user_id := auth\.uid\(\)/);
  assert.match(sharedSettingsMigrationSource, /if current_user_id is null then/);
  assert.match(sharedSettingsMigrationSource, /user_id = current_user_id/);
  assert.match(sharedSettingsMigrationSource, /version = p_expected_version/);
  assert.match(sharedSettingsMigrationSource, /version = public\.lee_lee_shared_settings\.version \+ 1/);
  assert.doesNotMatch(rpcMigrationBlock, /updated_at\s*=/);
  assert.match(sharedSettingsMigrationSource, /revoke update, delete on public\.lee_lee_shared_settings from authenticated, anon, public/);
  assert.match(sharedSettingsMigrationSource, /grant select, insert on public\.lee_lee_shared_settings to authenticated/);
  assert.match(sharedSettingsMigrationSource, /grant execute on function public\.update_lee_lee_shared_settings_with_version[\s\S]*to authenticated/);
  assert.match(sharedSettingsMigrationSource, /revoke all on function public\.update_lee_lee_shared_settings_with_version[\s\S]*from public, anon/);
});

test('versioned RPC mock succeeds for owner and returns no row for another user', async () => {
  const sharedRow = {
    id: 'record-1',
    user_id: 'user-1',
    record_type: 'Breakfast',
    blood_sugar: 180,
    insulin_units: 5,
    administered_insulin_units: 5,
    notes: '',
    recorded_at: '2026-08-01T12:42:00.000Z',
    client_created_at: '2026-08-01T12:45:00.000Z',
    created_at: '2026-08-01T12:45:00.000Z',
    updated_at: '2026-08-01T12:45:00.000Z',
    version: 1,
    entered_by: 'Rolando',
    payload: record({ bloodSugar: 180, version: 1 }),
  };
  const ownerSupabase = createMockSupabase([sharedRow], { userId: 'user-1' });
  const otherSupabase = createMockSupabase([sharedRow], { userId: 'user-2' });

  const ownerResult = await ownerSupabase.client.rpc('update_lee_lee_record_with_version', {
    p_id: 'record-1',
    p_expected_version: 1,
    p_record_type: 'Breakfast',
    p_blood_sugar: 190,
    p_insulin_units: 5,
    p_administered_insulin_units: 5,
    p_suggested_base_units: null,
    p_suggested_correction_units: null,
    p_suggested_total_units: null,
    p_insulin_plan_id: null,
    p_insulin_plan_snapshot: null,
    p_dose_calculation_status: 'manual',
    p_notes: '',
    p_recorded_at: '2026-08-01T12:42:00.000Z',
    p_entered_by: 'Rolando',
    p_last_edited_by: 'Rolando',
    p_deleted_at: null,
    p_deleted_by: null,
    p_source: 'app',
    p_client_created_at: '2026-08-01T12:45:00.000Z',
    p_migration_fingerprint: null,
    p_import_fingerprint: null,
    p_app_schema_version: 1,
    p_payload: record({ bloodSugar: 190, version: 1 }),
  });
  const otherResult = await otherSupabase.client.rpc('update_lee_lee_record_with_version', {
    ...ownerSupabase.client.rpcCalls[0].args,
    p_expected_version: 1,
  });

  assert.equal(ownerResult.data.blood_sugar, 190);
  assert.equal(ownerResult.data.version, 2);
  assert.equal(otherResult.data, null);
});
