(() => {
  const CONFIG_GLOBAL = 'LEE_LEES_TRACKER_SUPABASE_CONFIG';
  const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
  const DEVICE_IDENTITY_KEY = 'lando-world:lee-lees-tracker:device-identity:v1';
  const SYNC_METADATA_KEY = 'lando-world:lee-lees-tracker:sync-metadata:v1';
  const SYNC_QUEUE_KEY = 'lando-world:lee-lees-tracker:sync-queue:v1';
  const SYNC_CONFLICTS_KEY = 'lando-world:lee-lees-tracker:sync-conflicts:v1';
  const LEGACY_MIGRATION_KEY = 'lando-world:lee-lees-tracker:legacy-migration:v1';
  const LEGACY_SNAPSHOT_PREFIX = 'lando-world:lee-lees-tracker:legacy-snapshot:';
  const REMOTE_RECORDS_TABLE = 'lee_lee_records';
  const DEVICE_USERS = ['Rolando', 'Emily', 'Unknown'];

  function nowIso() {
    return new Date().toISOString();
  }

  function createId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getConfig() {
    const config = globalThis[CONFIG_GLOBAL] || {};
    const url = String(config.url || config.supabaseUrl || '').trim();
    const publishableKey = String(config.publishableKey || config.anonKey || '').trim();
    return {
      url,
      publishableKey,
      configured: /^https:\/\/.+\.supabase\.co$/.test(url) && publishableKey.length > 20,
    };
  }

  async function loadSupabaseFactory() {
    if (globalThis.supabase?.createClient) return globalThis.supabase.createClient;
    if (globalThis.createClient) return globalThis.createClient;
    const module = await import(SUPABASE_CDN_URL);
    return module.createClient;
  }

  function getDeviceIdentity() {
    const value = String(localStorage.getItem(DEVICE_IDENTITY_KEY) || '').trim();
    return DEVICE_USERS.includes(value) ? value : '';
  }

  function setDeviceIdentity(value) {
    const nextValue = DEVICE_USERS.includes(value) ? value : 'Unknown';
    localStorage.setItem(DEVICE_IDENTITY_KEY, nextValue);
    return nextValue;
  }

  function getMetadata() {
    return {
      lastSuccessfulSyncAt: null,
      realtimeStatus: 'idle',
      lastError: '',
      ...readJson(SYNC_METADATA_KEY, {}),
    };
  }

  function setMetadata(patch) {
    const metadata = { ...getMetadata(), ...patch };
    writeJson(SYNC_METADATA_KEY, metadata);
    return metadata;
  }

  function getQueue() {
    return readJson(SYNC_QUEUE_KEY, []).filter((operation) => operation && operation.id);
  }

  function setQueue(queue) {
    writeJson(SYNC_QUEUE_KEY, queue);
  }

  function getConflicts() {
    return readJson(SYNC_CONFLICTS_KEY, []).filter((conflict) => conflict && conflict.recordId);
  }

  function setConflicts(conflicts) {
    writeJson(SYNC_CONFLICTS_KEY, conflicts);
  }

  function publicRecord(record) {
    const {
      syncStatus,
      syncError,
      pendingOperationId,
      ...rest
    } = record || {};
    return rest;
  }

  function sanitizeRecordForRemote(record, userId) {
    return {
      id: record.id,
      user_id: userId,
      record_type: record.type || 'Other',
      blood_sugar: record.bloodSugar,
      insulin_units: record.insulinUnits,
      administered_insulin_units: record.administeredInsulinUnits,
      suggested_base_units: record.suggestedBaseUnits,
      suggested_correction_units: record.suggestedCorrectionUnits,
      suggested_total_units: record.suggestedTotalUnits,
      insulin_plan_id: record.insulinPlanId,
      insulin_plan_snapshot: record.insulinPlanSnapshot || null,
      dose_calculation_status: record.doseCalculationStatus || 'manual',
      notes: record.notes || '',
      recorded_at: record.recordTimestamp,
      client_created_at: record.clientCreatedAt || record.createdAt,
      entered_by: record.enteredBy || record.entered_by || 'Unknown',
      last_edited_by: record.lastEditedBy || record.last_edited_by || null,
      deleted_at: record.deletedAt || record.deleted_at || null,
      deleted_by: record.deletedBy || record.deleted_by || null,
      source: record.source || 'app',
      migration_fingerprint: record.migrationFingerprint || record.migration_fingerprint || null,
      import_fingerprint: record.importFingerprint || record.import_fingerprint || null,
      app_schema_version: record.appSchemaVersion || 1,
      version: Number(record.version || 1),
      payload: publicRecord(record),
    };
  }

  function createVersionedMutationArgs(remoteRecord, expectedVersion) {
    return {
      p_id: remoteRecord.id,
      p_expected_version: Number(expectedVersion),
      p_record_type: remoteRecord.record_type,
      p_blood_sugar: remoteRecord.blood_sugar,
      p_insulin_units: remoteRecord.insulin_units,
      p_administered_insulin_units: remoteRecord.administered_insulin_units,
      p_suggested_base_units: remoteRecord.suggested_base_units,
      p_suggested_correction_units: remoteRecord.suggested_correction_units,
      p_suggested_total_units: remoteRecord.suggested_total_units,
      p_insulin_plan_id: remoteRecord.insulin_plan_id,
      p_insulin_plan_snapshot: remoteRecord.insulin_plan_snapshot,
      p_dose_calculation_status: remoteRecord.dose_calculation_status,
      p_notes: remoteRecord.notes,
      p_recorded_at: remoteRecord.recorded_at,
      p_entered_by: remoteRecord.entered_by,
      p_last_edited_by: remoteRecord.last_edited_by,
      p_deleted_at: remoteRecord.deleted_at,
      p_deleted_by: remoteRecord.deleted_by,
      p_source: remoteRecord.source,
      p_client_created_at: remoteRecord.client_created_at,
      p_migration_fingerprint: remoteRecord.migration_fingerprint,
      p_import_fingerprint: remoteRecord.import_fingerprint,
      p_app_schema_version: remoteRecord.app_schema_version,
      p_payload: remoteRecord.payload,
    };
  }

  function recordFromRemote(row) {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    return {
      ...payload,
      id: row.id,
      type: row.record_type || payload.type || 'Other',
      bloodSugar: row.blood_sugar,
      insulinUnits: row.insulin_units,
      administeredInsulinUnits: row.administered_insulin_units,
      suggestedBaseUnits: row.suggested_base_units,
      suggestedCorrectionUnits: row.suggested_correction_units,
      suggestedTotalUnits: row.suggested_total_units,
      insulinPlanId: row.insulin_plan_id,
      insulinPlanSnapshot: row.insulin_plan_snapshot || null,
      doseCalculationStatus: row.dose_calculation_status || payload.doseCalculationStatus || 'manual',
      notes: row.notes || '',
      recordTimestamp: row.recorded_at,
      createdAt: row.created_at || payload.createdAt || row.client_created_at,
      updatedAt: row.updated_at || payload.updatedAt || row.client_created_at,
      clientCreatedAt: row.client_created_at || payload.clientCreatedAt,
      version: Number(row.version || payload.version || 1),
      enteredBy: row.entered_by || payload.enteredBy || 'Unknown',
      lastEditedBy: row.last_edited_by || payload.lastEditedBy || null,
      deletedAt: row.deleted_at || payload.deletedAt || null,
      deletedBy: row.deleted_by || payload.deletedBy || null,
      source: row.source || payload.source || 'app',
      migrationFingerprint: row.migration_fingerprint || payload.migrationFingerprint || null,
      importFingerprint: row.import_fingerprint || payload.importFingerprint || null,
      appSchemaVersion: row.app_schema_version || payload.appSchemaVersion || 1,
      syncStatus: 'synced',
    };
  }

  function createOperation(type, record, baseVersion = null) {
    return {
      id: createId(),
      recordId: record.id,
      type,
      payload: publicRecord(record),
      baseVersion,
      createdAt: nowIso(),
      retryCount: 0,
      lastErrorCategory: '',
      state: 'pending',
    };
  }

  function fingerprintRecord(record) {
    return [
      record.id,
      record.recordTimestamp,
      record.type,
      record.bloodSugar ?? '',
      record.insulinUnits ?? '',
      record.administeredInsulinUnits ?? '',
      record.notes || '',
    ].join('|');
  }

  function recordsHaveSameContent(left, right) {
    return fingerprintRecord(left) === fingerprintRecord(right)
      && String(left.deletedAt || '') === String(right.deletedAt || '')
      && String(left.deletedBy || '') === String(right.deletedBy || '');
  }

  function createRepository(options) {
    const {
      getDocument,
      saveDocument,
      normalizeRecord,
      mergeDocuments,
      onRemoteChange,
      legacyRecordKeys = [],
    } = options;
    const listeners = new Set();
    let supabaseClient = null;
    let session = null;
    let initialized = false;
    let processing = false;
    let realtimeChannel = null;

    function emit() {
      listeners.forEach((listener) => listener(getSyncStatus()));
    }

    function getSyncStatus() {
      const config = getConfig();
      const queue = getQueue();
      const conflicts = getConflicts();
      const metadata = getMetadata();
      const pendingCount = queue.filter((operation) => operation.state !== 'conflicted').length;
      let state = 'saved';
      let message = 'Saved on this device';
      if (!config.configured) {
        state = 'config-needed';
        message = 'Supabase setup needed';
      } else if (!session) {
        state = 'signed-out';
        message = 'Sign in to sync';
      } else if (conflicts.length) {
        state = 'conflict';
        message = 'Conflict needs review';
      } else if (pendingCount && !navigator.onLine) {
        state = 'offline';
        message = `Offline — ${pendingCount} waiting to sync`;
      } else if (pendingCount) {
        state = processing ? 'syncing' : 'waiting';
        message = processing ? 'Syncing…' : `${pendingCount} waiting to sync`;
      } else if (metadata.lastSuccessfulSyncAt) {
        state = 'synced';
        message = 'Synced';
      }
      return {
        configured: config.configured,
        signedIn: Boolean(session),
        deviceIdentity: getDeviceIdentity(),
        pendingCount,
        conflictCount: conflicts.length,
        lastSuccessfulSyncAt: metadata.lastSuccessfulSyncAt,
        realtimeStatus: metadata.realtimeStatus || 'idle',
        lastError: metadata.lastError || '',
        state,
        message,
      };
    }

    function subscribe(listener) {
      listeners.add(listener);
      listener(getSyncStatus());
      return () => listeners.delete(listener);
    }

    async function ensureClient() {
      const config = getConfig();
      if (!config.configured) return null;
      if (!supabaseClient) {
        const createClient = await loadSupabaseFactory();
        supabaseClient = createClient(config.url, config.publishableKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        });
      }
      return supabaseClient;
    }

    async function initialize() {
      if (initialized) return getSyncStatus();
      initialized = true;
      try {
        const client = await ensureClient();
        if (client) {
          const { data } = await client.auth.getSession();
          session = data?.session || null;
          client.auth.onAuthStateChange((_event, nextSession) => {
            session = nextSession || null;
            if (session) {
              reconcile().catch(() => {});
              subscribeRealtime();
            } else {
              unsubscribeRealtime();
            }
            emit();
          });
          if (session) {
            subscribeRealtime();
            await reconcile();
          }
        }
      } catch (error) {
        setMetadata({ lastError: 'Supabase could not be reached.' });
      }
      emit();
      return getSyncStatus();
    }

    async function signIn(email, password) {
      const client = await ensureClient();
      if (!client) return { error: 'Supabase setup is missing.' };
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        setMetadata({ lastError: error.message || 'Sign-in failed.' });
        emit();
        return { error: 'Sign-in failed. Check the email and password.' };
      }
      session = data?.session || null;
      await reconcile();
      subscribeRealtime();
      emit();
      return { ok: true };
    }

    async function signOut() {
      const client = await ensureClient();
      if (client) await client.auth.signOut({ scope: 'local' });
      session = null;
      unsubscribeRealtime();
      emit();
    }

    async function sendPasswordReset(email) {
      const client = await ensureClient();
      if (!client) return { error: 'Supabase setup is missing.' };
      const redirectTo = `${location.origin}${location.pathname}`;
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) return { error: 'Password reset could not be started.' };
      return { ok: true };
    }

    function markLocalRecord(record, status, error = '') {
      const current = getDocument();
      const nextRecords = current.records.map((item) => item.id === record.id
        ? { ...item, syncStatus: status, syncError: error }
        : item);
      saveDocument({ ...current, records: nextRecords }, { keepStatus: true });
    }

    function queueOperation(type, record, baseVersion = null) {
      const operation = createOperation(type, record, baseVersion);
      setQueue([...getQueue(), operation]);
      markLocalRecord(record, navigator.onLine ? 'waiting' : 'offline');
      emit();
      processQueue().catch(() => {});
      return operation;
    }

    function queueUpsert(record, existingRecord = null) {
      const identity = getDeviceIdentity() || 'Unknown';
      const now = nowIso();
      const nextRecord = normalizeRecord({
        ...record,
        version: existingRecord ? Number(existingRecord.version || 1) : 1,
        enteredBy: existingRecord?.enteredBy || record.enteredBy || identity,
        lastEditedBy: existingRecord ? identity : record.lastEditedBy || null,
        source: record.source || 'app',
        clientCreatedAt: record.clientCreatedAt || record.createdAt || now,
      });
      return queueOperation(existingRecord ? 'update' : 'insert', nextRecord, existingRecord?.version || null);
    }

    function queueSoftDelete(record) {
      const identity = getDeviceIdentity() || 'Unknown';
      const now = nowIso();
      const nextRecord = normalizeRecord({
        ...record,
        deletedAt: now,
        deletedBy: identity,
        lastEditedBy: identity,
        updatedAt: now,
        version: Number(record.version || 1),
      });
      return queueOperation('soft-delete', nextRecord, record.version || null);
    }

    function queueRestore(record) {
      const identity = getDeviceIdentity() || 'Unknown';
      const now = nowIso();
      const nextRecord = normalizeRecord({
        ...record,
        deletedAt: null,
        deletedBy: null,
        lastEditedBy: identity,
        updatedAt: now,
        version: Number(record.version || 1),
      });
      return queueOperation('restore', nextRecord, record.version || null);
    }

    async function processQueue() {
      if (processing || !navigator.onLine) return getSyncStatus();
      const client = await ensureClient();
      if (!client || !session?.user?.id) return getSyncStatus();
      processing = true;
      emit();
      const remaining = [];
      for (const operation of getQueue()) {
        try {
          const remoteRecord = sanitizeRecordForRemote(operation.payload, session.user.id);
          if (operation.type === 'insert') {
            const { data, error } = await client
              .from(REMOTE_RECORDS_TABLE)
              .insert(remoteRecord)
              .select()
              .single();
            if (error) {
              if (isDuplicateKeyError(error)) {
                const existing = await fetchRemoteRecord(operation.recordId);
                if (existing && recordsHaveSameContent(existing, operation.payload)) {
                  mergeRemoteRecords([existing]);
                  continue;
                }
                await registerConflict(operation, existing);
                continue;
              }
              throw error;
            }
            mergeRemoteRecords([recordFromRemote(data)]);
            continue;
          }
          const expectedVersion = Number(operation.baseVersion || operation.payload.version || 1);
          const { data, error } = await client
            .rpc('update_lee_lee_record_with_version', createVersionedMutationArgs(remoteRecord, expectedVersion));
          if (error) throw error;
          const updatedRow = Array.isArray(data) ? data[0] : data;
          if (!updatedRow) {
            await registerConflict(operation);
            continue;
          }
          mergeRemoteRecords([recordFromRemote(updatedRow)]);
        } catch (error) {
          const failed = {
            ...operation,
            retryCount: Number(operation.retryCount || 0) + 1,
            lastErrorCategory: categorizeError(error),
            state: 'pending',
          };
          remaining.push(failed);
          if (failed.lastErrorCategory === 'permission' || failed.lastErrorCategory === 'validation') {
            setMetadata({ lastError: 'A sync item needs review before it can be uploaded.' });
          } else {
            setMetadata({ lastError: 'Sync will retry when the connection is available.' });
          }
        }
      }
      setQueue(remaining);
      processing = false;
      if (!remaining.length) setMetadata({ lastSuccessfulSyncAt: nowIso(), lastError: '' });
      emit();
      return getSyncStatus();
    }

    function categorizeError(error) {
      const message = String(error?.message || error || '').toLowerCase();
      if (message.includes('permission') || message.includes('rls') || message.includes('jwt')) return 'permission';
      if (message.includes('invalid') || message.includes('constraint')) return 'validation';
      return navigator.onLine ? 'remote' : 'network';
    }

    function isDuplicateKeyError(error) {
      return error?.code === '23505' || String(error?.message || '').toLowerCase().includes('duplicate');
    }

    async function fetchRemoteRecord(recordId) {
      const client = await ensureClient();
      if (client && session?.user?.id) {
        const { data } = await client
          .from(REMOTE_RECORDS_TABLE)
          .select('*')
            .eq('id', recordId)
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (data) return recordFromRemote(data);
      }
      return null;
    }

    async function registerConflict(operation, knownSharedRecord = null) {
      const sharedRecord = knownSharedRecord || await fetchRemoteRecord(operation.recordId);
      setConflicts([
        ...getConflicts().filter((conflict) => conflict.recordId !== operation.recordId),
        {
          id: createId(),
          recordId: operation.recordId,
          operation,
          localRecord: operation.payload,
          sharedRecord,
          createdAt: nowIso(),
        },
      ]);
      markLocalRecord(operation.payload, 'conflict', 'This record changed on another device.');
    }

    async function reconcile() {
      const client = await ensureClient();
      if (!client || !session?.user?.id) return getSyncStatus();
      const { data, error } = await client
        .from(REMOTE_RECORDS_TABLE)
        .select('*')
        .eq('user_id', session.user.id)
        .order('recorded_at', { ascending: false });
      if (error) {
        setMetadata({ lastError: 'Shared records could not be refreshed.' });
        emit();
        return getSyncStatus();
      }
      mergeRemoteRecords((data || []).map(recordFromRemote));
      await processQueue();
      setMetadata({ lastSuccessfulSyncAt: nowIso(), lastError: '' });
      emit();
      return getSyncStatus();
    }

    function mergeRemoteRecords(remoteRecords) {
      if (!remoteRecords.length) return;
      const current = getDocument();
      const pendingIds = new Set(getQueue().map((operation) => operation.recordId));
      const safeRemote = remoteRecords.filter((record) => !pendingIds.has(record.id));
      const merged = mergeDocuments(current, { ...current, records: safeRemote });
      saveDocument(merged, { keepStatus: true });
      onRemoteChange?.(merged);
    }

    function subscribeRealtime() {
      if (!supabaseClient || !session?.user?.id || realtimeChannel) return;
      setMetadata({ realtimeStatus: 'connecting' });
      realtimeChannel = supabaseClient
        .channel('lee-lee-records')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: REMOTE_RECORDS_TABLE,
            filter: `user_id=eq.${session.user.id}`,
          },
          (payload) => {
            const row = payload.new || payload.old;
            if (row?.id) mergeRemoteRecords([recordFromRemote(row)]);
          },
        )
        .subscribe((status) => {
          setMetadata({ realtimeStatus: status === 'SUBSCRIBED' ? 'connected' : 'connecting' });
          emit();
        });
    }

    function unsubscribeRealtime() {
      if (realtimeChannel && supabaseClient) supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
      setMetadata({ realtimeStatus: 'idle' });
    }

    async function keepSharedVersion(recordId) {
      const conflicts = getConflicts();
      const conflict = conflicts.find((item) => item.recordId === recordId);
      if (!conflict) return;
      setQueue(getQueue().filter((operation) => operation.recordId !== recordId));
      if (conflict.sharedRecord) mergeRemoteRecords([conflict.sharedRecord]);
      setConflicts(conflicts.filter((item) => item.recordId !== recordId));
      emit();
    }

    async function useLocalVersion(recordId) {
      const conflicts = getConflicts();
      const conflict = conflicts.find((item) => item.recordId === recordId);
      if (!conflict) return;
      const sharedVersion = Number(conflict.sharedRecord?.version || conflict.operation.baseVersion || 1);
      setConflicts(conflicts.filter((item) => item.recordId !== recordId));
      setQueue([
        ...getQueue().filter((operation) => operation.recordId !== recordId),
        {
          ...createOperation('update', {
            ...conflict.localRecord,
            version: sharedVersion,
            lastEditedBy: getDeviceIdentity() || 'Unknown',
          }, sharedVersion),
        },
      ]);
      await processQueue();
    }

    function inspectLegacyMigration(keys = legacyRecordKeys) {
      const sourceRecords = [];
      const invalidRecords = [];
      keys.forEach((key) => {
        const payload = readJson(key, null);
        if (Array.isArray(payload)) {
          payload.forEach((record, index) => {
            const normalized = normalizeRecord(record);
            if (normalized) {
              sourceRecords.push({ key, index, record: normalized });
            } else {
              invalidRecords.push({ key, index });
            }
          });
        }
      });
      const timestamps = sourceRecords
        .map(({ record }) => Date.parse(record.recordTimestamp))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      return {
        complete: readJson(LEGACY_MIGRATION_KEY, {}).complete === true,
        totalRecords: sourceRecords.length + invalidRecords.length,
        validRecords: sourceRecords.length,
        invalidRecords: invalidRecords.length,
        earliestRecordAt: timestamps.length ? new Date(timestamps[0]).toISOString() : null,
        latestRecordAt: timestamps.length ? new Date(timestamps[timestamps.length - 1]).toISOString() : null,
      };
    }

    function createLegacySafetySnapshot(keys = legacyRecordKeys) {
      const snapshot = {
        backupFormat: 'lee-lee-tracker-legacy-snapshot',
        version: 1,
        createdAt: nowIso(),
        sources: Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])),
      };
      writeJson(`${LEGACY_SNAPSHOT_PREFIX}${Date.now()}`, snapshot);
      return snapshot;
    }

    function previewJsonImport(payload, currentRecords) {
      if (!payload || typeof payload !== 'object') return { error: 'Choose a valid Lee-Lee’s Tracker backup file.' };
      if (!['lando-world:lee-lees-tracker', 'lee-lee-tracker-full-backup'].includes(payload.appIdentifier || payload.backupFormat)) {
        return { error: 'Choose a valid Lee-Lee’s Tracker backup file.' };
      }
      const importedRecords = Array.isArray(payload.records) ? payload.records.map(normalizeRecord).filter(Boolean) : [];
      const currentById = new Map(currentRecords.map((record) => [record.id, record]));
      const summary = {
        backupCreatedAt: payload.exportedAt || payload.createdAt || '',
        totalRecords: importedRecords.length,
        newRecords: [],
        identicalRecords: [],
        conflictingRecords: [],
        invalidRecords: Array.isArray(payload.records) ? payload.records.length - importedRecords.length : 0,
        softDeletedRecords: importedRecords.filter((record) => record.deletedAt).length,
      };
      importedRecords.forEach((record) => {
        const existing = currentById.get(record.id);
        if (!existing) {
          summary.newRecords.push(record);
        } else if (fingerprintRecord(existing) === fingerprintRecord(record)) {
          summary.identicalRecords.push(record);
        } else {
          summary.conflictingRecords.push({ current: existing, imported: record });
        }
      });
      return { summary };
    }

    function exportCsv(sourceRecords) {
      const headers = [
        'Date',
        'Time',
        'Record Type',
        'Glucose',
        'Insulin Units',
        'Notes',
        'Entered By',
        'Last Edited By',
        'Created At',
        'Updated At',
      ];
      const rows = sourceRecords
        .filter((record) => !record.deletedAt)
        .map((record) => {
          const timestamp = new Date(record.recordTimestamp);
          return [
            timestamp.toLocaleDateString(),
            timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            record.type,
            record.bloodSugar ?? '',
            record.insulinUnits ?? '',
            record.notes || '',
            record.enteredBy || '',
            record.lastEditedBy || '',
            record.createdAt || '',
            record.updatedAt || '',
          ];
        });
      return [headers, ...rows]
        .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
        .join('\n');
    }

    globalThis.addEventListener?.('online', () => processQueue().catch(() => {}));
    globalThis.addEventListener?.('visibilitychange', () => {
      if (document.visibilityState === 'visible') reconcile().catch(() => {});
    });
    globalThis.setInterval?.(() => {
      if (session) reconcile().catch(() => {});
    }, 5 * 60 * 1000);

    return {
      initialize,
      signIn,
      signOut,
      sendPasswordReset,
      subscribe,
      getSyncStatus,
      getDeviceIdentity,
      setDeviceIdentity,
      queueUpsert,
      queueSoftDelete,
      queueRestore,
      processQueue,
      syncNow: reconcile,
      getConflicts,
      keepSharedVersion,
      useLocalVersion,
      inspectLegacyMigration,
      createLegacySafetySnapshot,
      previewJsonImport,
      exportCsv,
      keys: {
        deviceIdentity: DEVICE_IDENTITY_KEY,
        queue: SYNC_QUEUE_KEY,
        conflicts: SYNC_CONFLICTS_KEY,
        migration: LEGACY_MIGRATION_KEY,
      },
    };
  }

  globalThis.LeeLeesTrackerSync = {
    createRepository,
    getConfig,
    getDeviceIdentity,
    setDeviceIdentity,
    DEVICE_USERS,
    REMOTE_RECORDS_TABLE,
    sanitizeRecordForRemote,
    recordFromRemote,
  };
})();
