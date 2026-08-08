(() => {
  const TRACKER_STORAGE_KEY = 'lando-world:lee-lees-tracker:v1';
  const TRACKER_SCHEMA_VERSION = 1;
  const PRE_IMPORT_BACKUP_PREFIX = `${TRACKER_STORAGE_KEY}:pre-import-backup:`;
  const SHARED_SYNC_MIGRATION_KEY = `${TRACKER_STORAGE_KEY}:shared-sync-migration:v1`;
  const SHARED_SYNC_MIGRATION_VERSION = 1;
  const MIN_MIGRATION_PROGRESS_MS = 450;
  const MIGRATION_MAX_RETRIES = 3;
  const MIGRATION_RETRY_BASE_MS = 600;
  const PRE_REBRAND_KEY_PREFIX = ['le', 'vi'].join('');
  const LEGACY_RECORD_STORAGE_KEYS = [
    `${PRE_REBRAND_KEY_PREFIX}_diabetes_records_v1`,
    'lee-lees-tracker',
    'leeLeesTracker',
    `${PRE_REBRAND_KEY_PREFIX}-diabetes-tracker`,
    'diabetes-tracker',
    'tracker-records',
    'glucose-records',
  ];
  const LEGACY_PLAN_STORAGE_KEYS = [
    `${PRE_REBRAND_KEY_PREFIX}_diabetes_insulin_plans_v1`,
  ];
  const ENTRY_TYPE_DEFINITIONS = Object.freeze([
    { type: 'Breakfast', label: 'Breakfast', clinicalLogPrimary: true, mealGuidance: true, fields: ['bloodSugar', 'insulinUnits', 'notes'] },
    { type: 'Lunch', label: 'Lunch', clinicalLogPrimary: true, mealGuidance: true, fields: ['bloodSugar', 'insulinUnits', 'notes'] },
    { type: 'Dinner', label: 'Dinner', clinicalLogPrimary: true, mealGuidance: true, fields: ['bloodSugar', 'insulinUnits', 'notes'] },
    { type: 'Bedtime', label: 'Bedtime', clinicalLogPrimary: true, mealGuidance: false, fields: ['bloodSugar', 'insulinUnits', 'notes'] },
    { type: '2 AM', label: '2 AM', clinicalLogPrimary: true, mealGuidance: false, fields: ['bloodSugar', 'insulinUnits', 'notes'] },
    { type: 'Correction', label: 'Correction', clinicalLogPrimary: false, mealGuidance: false, fields: ['bloodSugar', 'insulinUnits', 'notes'] },
    { type: 'Snack', label: 'Snack', clinicalLogPrimary: false, mealGuidance: false, fields: ['bloodSugar', 'insulinUnits', 'notes'] },
    { type: 'Exercise', label: 'Exercise', clinicalLogPrimary: false, mealGuidance: false, fields: ['bloodSugar', 'insulinUnits', 'notes'] },
    { type: 'Other', label: 'Other', clinicalLogPrimary: false, mealGuidance: false, fields: ['bloodSugar', 'insulinUnits', 'notes'] },
  ]);
  const ENTRY_TYPE_CONFIG = Object.freeze(Object.fromEntries(
    ENTRY_TYPE_DEFINITIONS.map((definition) => [definition.type, Object.freeze({ ...definition, fields: Object.freeze([...definition.fields]) })]),
  ));
  const PRIMARY_TYPES = ENTRY_TYPE_DEFINITIONS.filter((definition) => definition.clinicalLogPrimary).map((definition) => definition.type);
  const EXTRA_TYPES = ENTRY_TYPE_DEFINITIONS.map((definition) => definition.type);
  const MEAL_TYPES = ENTRY_TYPE_DEFINITIONS.filter((definition) => definition.mealGuidance).map((definition) => definition.type);
  const DEFAULT_ENTRY_TYPE = EXTRA_TYPES[0];
  const TRACKER_NAV_ITEMS = Object.freeze([
    ['today', 'Today'],
    ['history', 'History'],
    ['export', 'Export'],
    ['settings', 'Settings'],
  ]);
  const DATE_RANGE_OPTIONS = [
    { value: 'today', label: 'Today', days: 1 },
    { value: 'last7', label: 'Last 7 days', days: 7 },
    { value: 'last14', label: 'Last 14 days', days: 14 },
    { value: 'last30', label: 'Last 30 days', days: 30 },
    { value: 'all', label: 'All records', days: null },
    { value: 'custom', label: 'Custom range', days: null },
  ];
  const EXPORT_RANGE_OPTIONS = DATE_RANGE_OPTIONS.filter((option) => option.value !== 'all');
  const HISTORY_WINDOW_OPTIONS = [
    { value: '7', label: '7 Days', days: 7 },
    { value: '14', label: '14 Days', days: 14 },
    { value: '30', label: '30 Days', days: 30 },
    { value: '60', label: '60 Days', days: 60 },
    { value: 'all', label: 'All Records', days: null },
  ];
  const DEFAULT_HISTORY_WINDOW_DAYS = 30;
  const DEFAULT_PLAN_EFFECTIVE_FROM = '2026-07-31';
  const DEFAULT_INSULIN_PLAN = {
    id: 'meal_plan_2026_07_31',
    name: 'Current Meal Insulin Plan',
    effectiveFrom: DEFAULT_PLAN_EFFECTIVE_FROM,
    effectiveTo: null,
    mealBaseUnits: 4,
    supportedMealTypes: [...MEAL_TYPES],
    correctionRanges: [
      { minGlucose: null, maxGlucose: 174, correctionUnits: 0 },
      { minGlucose: 175, maxGlucose: 249, correctionUnits: 1 },
      { minGlucose: 250, maxGlucose: 324, correctionUnits: 2 },
      { minGlucose: 325, maxGlucose: 399, correctionUnits: 3 },
      { minGlucose: 400, maxGlucose: 474, correctionUnits: 4 },
      { minGlucose: 475, maxGlucose: 549, correctionUnits: 5 },
    ],
    notes: '',
    createdAt: new Date(`${DEFAULT_PLAN_EFFECTIVE_FROM}T00:00`).toISOString(),
    updatedAt: new Date(`${DEFAULT_PLAN_EFFECTIVE_FROM}T00:00`).toISOString(),
  };

  const storageAvailability = checkStorageAvailability();
  let persistenceStatus = storageAvailability.available ? 'saved' : 'unavailable';
  let persistenceMessage = storageAvailability.available
    ? 'Saved on this device'
    : 'Records are visible, but this browser is not allowing this device to save tracker data.';
  let trackerData = loadTrackerData();
  let records = trackerData.records;
  let insulinPlans = trackerData.insulinPlans;
  let historyFilters = {
    range: 'all',
    type: 'All',
    startDate: '',
    endDate: '',
  };
  let historyDraftFilters = { ...historyFilters };
  let historyVisibleDayCount = null;
  let historyFilterSheetOpen = false;
  let trackerMenuOpen = false;
  let lastFocusedElement = null;
  let exportOptions = {
    range: 'last7',
    layout: 'clinical',
    startDate: '',
    endDate: '',
  };
  let currentEditor = null;
  let syncRepository = null;
  let syncStatus = {
    configured: false,
    signedIn: false,
    deviceIdentity: '',
    pendingCount: 0,
    conflictCount: 0,
    realtimeStatus: 'idle',
    state: 'saved',
    message: 'Saved on this device',
  };
  let authMessage = '';
  let authError = '';
  let patientSettingsMessage = '';
  let patientSettingsError = '';
  let conflictSelection = new Set();
  let conflictAutoResolvedCount = 0;
  let conflictBulkState = null;
  let migrationFlow = {
    state: 'idle',
    total: 0,
    uploaded: 0,
    duplicates: 0,
    conflicts: 0,
    remaining: 0,
    startedFrom: 'home',
    error: '',
  };
  let migrationRetryTimer = null;

  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function getRoot() {
    return document.getElementById('lee-lee-diabetes-root');
  }

  function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getLocalTimeKey(date = new Date()) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function formatDate(date = new Date()) {
    return new Intl.DateTimeFormat(navigator.language || undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(date);
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat(navigator.language || undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  }

  function createLocalTimestamp(dateKey, timeKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return null;
    if (!/^\d{2}:\d{2}$/.test(String(timeKey || ''))) return null;
    const date = new Date(`${dateKey}T${timeKey}`);
    const timestamp = date.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function createDateStartTimestamp(dateKey) {
    return createLocalTimestamp(dateKey, '00:00');
  }

  function getRecordTimestamp(record) {
    const timestamp = parseTimestamp(record?.recordTimestamp);
    if (Number.isFinite(timestamp)) return timestamp;
    const combinedTimestamp = createLocalTimestamp(record?.date, record?.time);
    if (Number.isFinite(combinedTimestamp)) return combinedTimestamp;
    const legacyTimestamp = parseTimestamp(record?.timestamp);
    return Number.isFinite(legacyTimestamp) ? legacyTimestamp : Date.now();
  }

  function clonePlanSnapshot(plan) {
    if (!plan) return null;
    return {
      id: plan.id,
      name: plan.name,
      effectiveFrom: plan.effectiveFrom,
      effectiveTo: plan.effectiveTo || null,
      mealBaseUnits: plan.mealBaseUnits,
      supportedMealTypes: [...plan.supportedMealTypes],
      correctionRanges: plan.correctionRanges.map((range) => ({ ...range })),
      notes: plan.notes || '',
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  function isWholePositiveGlucose(value) {
    return /^\d+$/.test(String(value || '').trim()) && Number(value) > 0;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function sanitizeNotes(value) {
    return String(value || '').replace(/\r/g, '').trim().slice(0, 500);
  }

  function normalizeNumber(value) {
    if (value === '' || value == null) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function parseTimestamp(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
      const timestamp = value.getTime();
      return Number.isFinite(timestamp) ? timestamp : null;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function toIsoTimestamp(value, fallback = Date.now()) {
    const timestamp = parseTimestamp(value) ?? parseTimestamp(fallback) ?? Date.now();
    return new Date(timestamp).toISOString();
  }

  function normalizeBloodSugar(value) {
    return isWholePositiveGlucose(value) ? Number(value) : null;
  }

  function getEntryTypeConfig(type) {
    return ENTRY_TYPE_CONFIG[type] || ENTRY_TYPE_CONFIG.Other;
  }

  function entryTypeHasField(type, fieldName) {
    return getEntryTypeConfig(type).fields.includes(fieldName);
  }

  function entryTypeUsesMealGuidance(type) {
    return getEntryTypeConfig(type).mealGuidance === true;
  }

  function normalizeCorrectionRange(range) {
    if (!range || typeof range !== 'object') return null;
    const minGlucose = range.minGlucose == null || range.minGlucose === ''
      ? null
      : Number(range.minGlucose);
    const maxGlucose = range.maxGlucose == null || range.maxGlucose === ''
      ? null
      : Number(range.maxGlucose);
    const correctionUnits = Number(range.correctionUnits);
    if (
      (minGlucose != null && (!Number.isInteger(minGlucose) || minGlucose < 0))
      || (maxGlucose != null && (!Number.isInteger(maxGlucose) || maxGlucose < 0))
      || !Number.isFinite(correctionUnits)
      || correctionUnits < 0
    ) {
      return null;
    }
    return { minGlucose, maxGlucose, correctionUnits };
  }

  function normalizeInsulinPlan(plan) {
    if (!plan || typeof plan !== 'object') return null;
    const effectiveFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(plan.effectiveFrom || ''))
      ? plan.effectiveFrom
      : DEFAULT_PLAN_EFFECTIVE_FROM;
    const effectiveTo = /^\d{4}-\d{2}-\d{2}$/.test(String(plan.effectiveTo || ''))
      ? plan.effectiveTo
      : null;
    const correctionRanges = Array.isArray(plan.correctionRanges)
      ? plan.correctionRanges.map(normalizeCorrectionRange).filter(Boolean)
      : [];
    const supportedMealTypes = Array.isArray(plan.supportedMealTypes)
      ? plan.supportedMealTypes.filter((type) => MEAL_TYPES.includes(type))
      : [...MEAL_TYPES];
    const nowTimestamp = new Date().toISOString();
    return {
      ...plan,
      id: typeof plan.id === 'string' ? plan.id : createId(),
      name: String(plan.name || DEFAULT_INSULIN_PLAN.name).trim().slice(0, 80),
      effectiveFrom,
      effectiveTo,
      mealBaseUnits: normalizeNumber(plan.mealBaseUnits) ?? DEFAULT_INSULIN_PLAN.mealBaseUnits,
      supportedMealTypes: supportedMealTypes.length ? supportedMealTypes : [...MEAL_TYPES],
      correctionRanges: correctionRanges.length ? correctionRanges : DEFAULT_INSULIN_PLAN.correctionRanges.map((range) => ({ ...range })),
      notes: sanitizeNotes(plan.notes),
      createdAt: toIsoTimestamp(plan.createdAt, nowTimestamp),
      updatedAt: toIsoTimestamp(plan.updatedAt, nowTimestamp),
    };
  }

  function normalizeDoseStatus(value) {
    return [
      'calculated',
      'unsupported-entry-type',
      'outside-configured-range',
      'manual',
      'unavailable',
    ].includes(value) ? value : 'manual';
  }

  function normalizeRecord(record) {
    if (!record || typeof record !== 'object') return null;
    const legacyTimestamp = parseTimestamp(record.timestamp);
    const combinedTimestamp = createLocalTimestamp(record.date, record.time);
    const fallbackTimestamp = Number.isFinite(legacyTimestamp)
      ? legacyTimestamp
      : (combinedTimestamp || Date.now());
    const rawRecordTimestamp = parseTimestamp(record.recordTimestamp);
    const recordTimestamp = Number.isFinite(rawRecordTimestamp) ? rawRecordTimestamp : fallbackTimestamp;
    const rawCreatedAt = parseTimestamp(record.createdAt);
    const rawUpdatedAt = parseTimestamp(record.updatedAt);
    const type = EXTRA_TYPES.includes(record.type) ? record.type : 'Other';
    const recordDate = new Date(recordTimestamp);
    const date = getLocalDateKey(recordDate);
    const time = getLocalTimeKey(recordDate);
    const administeredInsulinUnits = normalizeNumber(record.administeredInsulinUnits ?? record.insulinUnits);
    return {
      ...record,
      id: typeof record.id === 'string' ? record.id : createId(),
      date,
      time,
      type,
      bloodSugar: normalizeBloodSugar(record.bloodSugar),
      insulinUnits: administeredInsulinUnits,
      administeredInsulinUnits,
      suggestedBaseUnits: normalizeNumber(record.suggestedBaseUnits),
      suggestedCorrectionUnits: normalizeNumber(record.suggestedCorrectionUnits),
      suggestedTotalUnits: normalizeNumber(record.suggestedTotalUnits),
      insulinPlanId: typeof record.insulinPlanId === 'string' ? record.insulinPlanId : null,
      insulinPlanSnapshot: record.insulinPlanSnapshot && typeof record.insulinPlanSnapshot === 'object'
        ? clonePlanSnapshot(normalizeInsulinPlan(record.insulinPlanSnapshot))
        : null,
      doseCalculationStatus: normalizeDoseStatus(record.doseCalculationStatus),
      notes: sanitizeNotes(record.notes),
      recordTimestamp: toIsoTimestamp(recordTimestamp, fallbackTimestamp),
      createdAt: toIsoTimestamp(rawCreatedAt, fallbackTimestamp),
      updatedAt: toIsoTimestamp(rawUpdatedAt, fallbackTimestamp),
      version: Number(record.version || 1),
      enteredBy: typeof record.enteredBy === 'string' ? record.enteredBy : (typeof record.entered_by === 'string' ? record.entered_by : 'Unknown'),
      lastEditedBy: typeof record.lastEditedBy === 'string' ? record.lastEditedBy : (typeof record.last_edited_by === 'string' ? record.last_edited_by : null),
      deletedAt: record.deletedAt || record.deleted_at || null,
      deletedBy: record.deletedBy || record.deleted_by || null,
      source: typeof record.source === 'string' ? record.source : 'app',
      clientCreatedAt: toIsoTimestamp(record.clientCreatedAt || record.client_created_at || rawCreatedAt, fallbackTimestamp),
      migrationFingerprint: record.migrationFingerprint || record.migration_fingerprint || null,
      importFingerprint: record.importFingerprint || record.import_fingerprint || null,
      appSchemaVersion: Number(record.appSchemaVersion || record.app_schema_version || TRACKER_SCHEMA_VERSION),
      syncStatus: record.syncStatus || 'local',
      syncError: record.syncError || '',
    };
  }

  function checkStorageAvailability() {
    const testKey = `${TRACKER_STORAGE_KEY}:storage-test`;
    try {
      localStorage.setItem(testKey, 'ok');
      const available = localStorage.getItem(testKey) === 'ok';
      localStorage.removeItem(testKey);
      return { available };
    } catch (error) {
      return { available: false };
    }
  }

  function readStoredJson(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { exists: false, data: null };
      return { exists: true, data: JSON.parse(raw), raw };
    } catch (error) {
      console.warn(`Lee-Lee’s Tracker could not parse stored data for key ${key}.`);
      return { exists: true, data: null, raw: localStorage.getItem(key), error };
    }
  }

  function getSharedSyncMigrationMetadata() {
    const stored = readStoredJson(SHARED_SYNC_MIGRATION_KEY);
    const source = stored.data && typeof stored.data === 'object' ? stored.data : {};
    return {
      migrationCompleted: source.migrationCompleted === true,
      migrationCompletedAt: typeof source.migrationCompletedAt === 'string' ? source.migrationCompletedAt : null,
      migrationVersion: Number(source.migrationVersion || 0) || null,
      recordsMigrated: Number(source.recordsMigrated || 0) || 0,
      promptDismissed: source.promptDismissed === true,
      promptDismissedAt: typeof source.promptDismissedAt === 'string' ? source.promptDismissedAt : null,
      welcomeShown: source.welcomeShown === true,
      welcomeShownAt: typeof source.welcomeShownAt === 'string' ? source.welcomeShownAt : null,
      session: source.session && typeof source.session === 'object' ? source.session : null,
    };
  }

  function saveSharedSyncMigrationMetadata(patch) {
    if (!storageAvailability.available) return false;
    const nextMetadata = {
      ...getSharedSyncMigrationMetadata(),
      ...patch,
    };
    try {
      localStorage.setItem(SHARED_SYNC_MIGRATION_KEY, JSON.stringify(nextMetadata));
      return true;
    } catch (error) {
      console.warn('Lee-Lee’s Tracker migration metadata could not be saved on this device.');
      return false;
    }
  }

  function createMigrationFingerprint(record) {
    return record.migrationFingerprint || [
      record.recordTimestamp,
      record.type,
      record.bloodSugar ?? '',
      record.insulinUnits ?? '',
      record.notes || '',
    ].join('|');
  }

  function createMigrationSessionKey(record) {
    return `${record.id || 'record'}::${createMigrationFingerprint(record)}`;
  }

  function createMigrationSession(recordsToMigrate) {
    const now = new Date().toISOString();
    const sourceRecordIds = recordsToMigrate.map((record) => record.id);
    const sourceFingerprints = recordsToMigrate.map(createMigrationSessionKey);
    return {
      migrationId: createId(),
      migrationVersion: SHARED_SYNC_MIGRATION_VERSION,
      status: 'running',
      originalTotal: sourceFingerprints.length,
      sourceRecordIds,
      sourceFingerprints,
      completedFingerprints: [],
      uploadedFingerprints: [],
      alreadyExistingFingerprints: [],
      duplicateFingerprints: [],
      conflictFingerprints: [],
      failedFingerprints: [],
      pendingFingerprints: [...sourceFingerprints],
      startedAt: now,
      lastProgressAt: now,
      lastAttemptAt: now,
      completedAt: null,
      retryCount: 0,
      lastErrorCategory: '',
      lastErrorMessage: '',
    };
  }

  function getMigrationSession() {
    return getSharedSyncMigrationMetadata().session;
  }

  function saveMigrationSession(session) {
    saveSharedSyncMigrationMetadata({ session });
    return session;
  }

  function uniquePush(list, value) {
    return list.includes(value) ? list : [...list, value];
  }

  function removeValue(list, value) {
    return list.filter((item) => item !== value);
  }

  function markMigrationOutcome(session, fingerprint, outcome, patch = {}) {
    const now = new Date().toISOString();
    const nextSession = {
      ...session,
      lastProgressAt: now,
      pendingFingerprints: removeValue(session.pendingFingerprints || [], fingerprint),
      failedFingerprints: removeValue(session.failedFingerprints || [], fingerprint),
      lastErrorCategory: '',
      lastErrorMessage: '',
      ...patch,
    };
    if (['uploaded', 'already-existing', 'duplicate', 'conflict'].includes(outcome)) {
      nextSession.completedFingerprints = uniquePush(session.completedFingerprints || [], fingerprint);
    }
    if (outcome === 'uploaded') nextSession.uploadedFingerprints = uniquePush(session.uploadedFingerprints || [], fingerprint);
    if (outcome === 'already-existing') nextSession.alreadyExistingFingerprints = uniquePush(session.alreadyExistingFingerprints || [], fingerprint);
    if (outcome === 'duplicate') nextSession.duplicateFingerprints = uniquePush(session.duplicateFingerprints || [], fingerprint);
    if (outcome === 'conflict') nextSession.conflictFingerprints = uniquePush(session.conflictFingerprints || [], fingerprint);
    if (outcome === 'failed') {
      nextSession.failedFingerprints = uniquePush(session.failedFingerprints || [], fingerprint);
      nextSession.pendingFingerprints = removeValue(session.pendingFingerprints || [], fingerprint);
    }
    return saveMigrationSession(nextSession);
  }

  function getMigrationSessionSummary(session = getMigrationSession()) {
    const uploaded = session?.uploadedFingerprints?.length || 0;
    const alreadyExisting = session?.alreadyExistingFingerprints?.length || 0;
    const duplicates = session?.duplicateFingerprints?.length || 0;
    const conflicts = session?.conflictFingerprints?.length || 0;
    const failed = session?.failedFingerprints?.length || 0;
    const processed = uploaded + alreadyExisting + duplicates + conflicts;
    const total = session?.originalTotal || 0;
    return {
      uploaded,
      alreadyExisting,
      duplicates,
      conflicts,
      failed,
      processed,
      total,
      remaining: Math.max(0, total - processed - failed),
      percent: total ? Math.round((processed / total) * 100) : 0,
    };
  }

  function classifyMigrationError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    if (navigator.onLine === false) return { category: 'offline', userMessage: 'Migration paused — you’re offline.' };
    if (message.includes('jwt') || message.includes('auth') || message.includes('sign')) return { category: 'authentication', userMessage: 'Please sign in again to continue migration.' };
    if (message.includes('rls') || message.includes('permission') || message.includes('authorization')) return { category: 'authorization', userMessage: 'Migration needs attention.' };
    if (message.includes('validation') || message.includes('invalid') || message.includes('constraint')) return { category: 'validation', userMessage: 'Migration needs attention.' };
    if (message.includes('timeout')) return { category: 'timeout', userMessage: 'Connection is slow. Retrying automatically…' };
    if (message.includes('rate')) return { category: 'rate-limited', userMessage: 'Shared Sync is temporarily unavailable. We’ll retry automatically.' };
    return { category: 'retryable-network', userMessage: 'Connection is slow. Retrying automatically…' };
  }

  function getMigrationRecordsForSession(session, allRecords) {
    const byFingerprint = new Map(allRecords.map((record) => [createMigrationSessionKey(record), record]));
    return (session?.sourceFingerprints || [])
      .filter((fingerprint) => (session.pendingFingerprints || []).includes(fingerprint))
      .map((fingerprint) => byFingerprint.get(fingerprint))
      .filter(Boolean);
  }

  function getLocalSharedSettings() {
    const settings = trackerData.settings || {};
    return {
      patientName: String(settings.patientName || '').trim().slice(0, 80),
      patientBirthDate: /^\d{4}-\d{2}-\d{2}$/.test(String(settings.patientBirthDate || '')) ? settings.patientBirthDate : '',
      clinicName: String(settings.clinicName || '').trim().slice(0, 120),
      clinicPhone: String(settings.clinicPhone || '').trim().slice(0, 40),
    };
  }

  function sharedSettingsHaveValues(settings = getLocalSharedSettings()) {
    return Boolean(settings.patientName || settings.patientBirthDate || settings.clinicName || settings.clinicPhone);
  }

  function applySharedSettingsToLocal(settings) {
    if (!settings) return;
    updateTrackerData((current) => ({
      ...current,
      settings: {
        ...(current.settings || {}),
        patientName: settings.patientName || '',
        patientBirthDate: settings.patientBirthDate || '',
        clinicName: settings.clinicName || '',
        clinicPhone: settings.clinicPhone || '',
      },
    }));
  }

  function getSharedSettingsStatus() {
    return syncRepository?.getSharedSettingsStatus?.() || {
      state: 'local',
      message: 'Patient and clinic information is saved on this device.',
      hasRemote: false,
      conflictCount: 0,
      pendingCount: 0,
      migration: {},
    };
  }

  function shouldShowSharedSettingsMigrationPrompt() {
    const status = getSharedSettingsStatus();
    const migration = status.migration || {};
    return shouldShowProtectedApp()
      && sharedSettingsHaveValues()
      && !status.hasRemote
      && !migration.completed
      && !migration.dismissedAt;
  }

  function createEmptyTrackerData(createdAt = new Date().toISOString()) {
    return {
      schemaVersion: TRACKER_SCHEMA_VERSION,
      records: [],
      settings: {},
      insulinPlans: [clonePlanSnapshot(DEFAULT_INSULIN_PLAN)],
      activeInsulinPlanId: DEFAULT_INSULIN_PLAN.id,
      recovery: {
        malformedRecords: [],
        malformedPlans: [],
      },
      metadata: {
        createdAt,
        updatedAt: createdAt,
      },
    };
  }

  function normalizeTrackerDataDocument(data) {
    const now = new Date().toISOString();
    const source = data && typeof data === 'object' ? data : {};
    const recovery = source.recovery && typeof source.recovery === 'object'
      ? {
        malformedRecords: Array.isArray(source.recovery.malformedRecords) ? [...source.recovery.malformedRecords] : [],
        malformedPlans: Array.isArray(source.recovery.malformedPlans) ? [...source.recovery.malformedPlans] : [],
      }
      : { malformedRecords: [], malformedPlans: [] };
    const recordsSource = Array.isArray(source.records) ? source.records : [];
    const plansSource = Array.isArray(source.insulinPlans) ? source.insulinPlans : [];
    const normalizedRecords = [];
    const normalizedPlans = [];
    recordsSource.forEach((record, index) => {
      const normalized = normalizeRecord(record);
      if (normalized) {
        normalizedRecords.push(normalized);
      } else {
        recovery.malformedRecords.push({ index, value: record, recoveredAt: now });
      }
    });
    plansSource.forEach((plan, index) => {
      const normalized = normalizeInsulinPlan(plan);
      if (normalized) {
        normalizedPlans.push(normalized);
      } else {
        recovery.malformedPlans.push({ index, value: plan, recoveredAt: now });
      }
    });
    const plans = normalizedPlans.length ? normalizedPlans : [clonePlanSnapshot(DEFAULT_INSULIN_PLAN)];
    return {
      ...source,
      schemaVersion: TRACKER_SCHEMA_VERSION,
      records: dedupeRecords(normalizedRecords),
      settings: source.settings && typeof source.settings === 'object' ? { ...source.settings } : {},
      insulinPlans: dedupePlans(plans),
      activeInsulinPlanId: typeof source.activeInsulinPlanId === 'string'
        ? source.activeInsulinPlanId
        : plans[0]?.id || null,
      recovery,
      metadata: {
        ...(source.metadata && typeof source.metadata === 'object' ? source.metadata : {}),
        createdAt: toIsoTimestamp(source.metadata?.createdAt, now),
        updatedAt: toIsoTimestamp(source.metadata?.updatedAt, now),
      },
    };
  }

  function getRecordIdentity(record) {
    if (record.id) return `id:${record.id}`;
    return [
      'composite',
      record.recordTimestamp,
      record.type,
      record.bloodSugar ?? '',
      record.insulinUnits ?? '',
      record.createdAt ?? '',
    ].join('|');
  }

  function dedupeRecords(sourceRecords) {
    const byIdentity = new Map();
    sourceRecords.forEach((record) => {
      const key = getRecordIdentity(record);
      const existing = byIdentity.get(key);
      if (!existing || getRecordTimestamp(record) >= getRecordTimestamp(existing)) {
        byIdentity.set(key, record);
      }
    });
    return [...byIdentity.values()];
  }

  function dedupePlans(sourcePlans) {
    const byId = new Map();
    sourcePlans.forEach((plan) => {
      const existing = byId.get(plan.id);
      const existingUpdatedAt = parseTimestamp(existing?.updatedAt) || 0;
      const planUpdatedAt = parseTimestamp(plan.updatedAt) || 0;
      if (!existing || planUpdatedAt >= existingUpdatedAt) byId.set(plan.id, plan);
    });
    return [...byId.values()];
  }

  function mergeTrackerDocuments(baseData, incomingData) {
    const base = normalizeTrackerDataDocument(baseData);
    const incoming = normalizeTrackerDataDocument(incomingData);
    return normalizeTrackerDataDocument({
      ...base,
      records: dedupeRecords([...base.records, ...incoming.records]),
      settings: {
        ...base.settings,
        ...incoming.settings,
      },
      insulinPlans: dedupePlans([...base.insulinPlans, ...incoming.insulinPlans]),
      activeInsulinPlanId: incoming.activeInsulinPlanId || base.activeInsulinPlanId,
      recovery: {
        malformedRecords: [
          ...(base.recovery?.malformedRecords || []),
          ...(incoming.recovery?.malformedRecords || []),
        ],
        malformedPlans: [
          ...(base.recovery?.malformedPlans || []),
          ...(incoming.recovery?.malformedPlans || []),
        ],
      },
      metadata: {
        createdAt: base.metadata?.createdAt,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  function migrateLegacyPayload(key, payload) {
    if (!payload) return null;
    if (Array.isArray(payload)) {
      if (LEGACY_PLAN_STORAGE_KEYS.includes(key)) {
        return { insulinPlans: payload };
      }
      return { records: payload };
    }
    if (payload && typeof payload === 'object') {
      return payload;
    }
    return null;
  }

  function loadTrackerData() {
    const stored = readStoredJson(TRACKER_STORAGE_KEY);
    let data = stored.exists && stored.data
      ? normalizeTrackerDataDocument(stored.data)
      : createEmptyTrackerData();
    let shouldWrite = !stored.exists;
    [...LEGACY_RECORD_STORAGE_KEYS, ...LEGACY_PLAN_STORAGE_KEYS].forEach((key) => {
      if (key === TRACKER_STORAGE_KEY) return;
      const legacy = readStoredJson(key);
      const legacyPayload = legacy.exists ? migrateLegacyPayload(key, legacy.data) : null;
      if (legacyPayload) {
        data = mergeTrackerDocuments(data, legacyPayload);
        shouldWrite = true;
      }
    });
    if (shouldWrite && storageAvailability.available) {
      writeTrackerDataDocument(data);
    }
    return data;
  }

  function writeTrackerDataDocument(data) {
    const nextData = normalizeTrackerDataDocument(data);
    try {
      localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(nextData));
      return { ok: true, data: nextData };
    } catch (error) {
      console.warn('Lee-Lee’s Tracker data could not be saved on this device.');
      return { ok: false, error };
    }
  }

  function saveTrackerData(data, options = {}) {
    if (!storageAvailability.available) {
      if (!options.keepStatus) setPersistenceStatus('unavailable');
      return { ok: false };
    }
    const nextData = normalizeTrackerDataDocument({
      ...data,
      metadata: {
        ...(data.metadata || {}),
        updatedAt: new Date().toISOString(),
      },
    });
    const written = writeTrackerDataDocument(nextData);
    if (written.ok) {
      trackerData = written.data;
      records = trackerData.records;
      insulinPlans = trackerData.insulinPlans;
      if (!options.keepStatus) setPersistenceStatus('saved');
      return { ok: true, data: trackerData };
    }
    if (!options.keepStatus) setPersistenceStatus('failed');
    return written;
  }

  function updateTrackerData(updater) {
    const latestStored = readStoredJson(TRACKER_STORAGE_KEY);
    const latest = latestStored.exists && latestStored.data
      ? mergeTrackerDocuments(trackerData, latestStored.data)
      : trackerData;
    const nextData = normalizeTrackerDataDocument(updater(latest));
    const saved = saveTrackerData(nextData);
    if (!saved.ok) {
      trackerData = nextData;
      records = trackerData.records;
      insulinPlans = trackerData.insulinPlans;
    }
    return saved;
  }

  function setPersistenceStatus(status) {
    persistenceStatus = status;
    persistenceMessage = {
      saved: 'Saved on this device',
      saving: 'Saving...',
      failed: 'Your record is visible, but it could not be saved on this device. Please keep this page open and try again.',
      unavailable: 'Records are visible, but this browser is not allowing this device to save tracker data.',
      imported: 'Backup imported and saved on this device',
      reloaded: 'Newer tracker data was loaded from this device.',
    }[status] || 'Saved on this device';
  }

  function formatRelativeSyncTime(timestamp, nowMs = Date.now()) {
    const syncMs = parseTimestamp(timestamp);
    if (!Number.isFinite(syncMs)) return 'Not yet';
    const elapsedMs = Math.max(0, nowMs - syncMs);
    const elapsedMinutes = Math.floor(elapsedMs / 60000);
    if (elapsedMinutes < 1) return 'just now';
    if (elapsedMinutes < 60) return `${elapsedMinutes} ${elapsedMinutes === 1 ? 'minute' : 'minutes'} ago`;
    const syncDate = new Date(syncMs);
    const nowDate = new Date(nowMs);
    if (getLocalDateKey(syncDate) === getLocalDateKey(nowDate)) return `Today ${formatTime(syncMs)}`;
    return `${formatDate(syncDate)} ${formatTime(syncMs)}`;
  }

  function getFriendlySyncStatus(status = syncStatus, nowMs = Date.now()) {
    if (!status.configured) return { state: 'config-needed', message: 'Supabase setup needed' };
    if (!status.signedIn) return { state: 'signed-out', message: 'Sign in to sync' };
    if (status.conflictCount) return { state: 'conflict', message: 'Conflict needs review' };
    if (status.state === 'syncing') return { state: 'syncing', message: 'Syncing...' };
    if (status.state === 'offline') return { state: 'offline', message: 'Offline / Waiting to reconnect' };
    if (status.pendingCount) return { state: 'waiting', message: `${status.pendingCount} waiting to sync` };
    if (status.realtimeStatus && !['idle', 'connected'].includes(status.realtimeStatus)) {
      return { state: 'waiting', message: 'Realtime disconnected / Using periodic sync' };
    }
    if (status.lastSuccessfulSyncAt) {
      return { state: 'synced', message: `✓ Synced ${formatRelativeSyncTime(status.lastSuccessfulSyncAt, nowMs)}` };
    }
    return { state: 'synced', message: '✓ Shared Sync Active' };
  }

  function renderPersistenceStatus() {
    const isSyncEnabled = syncRepository && syncStatus.configured && syncStatus.signedIn;
    const friendlyStatus = getFriendlySyncStatus(syncStatus);
    const statusClass = isSyncEnabled ? friendlyStatus.state : persistenceStatus;
    const statusMessage = isSyncEnabled ? friendlyStatus.message : persistenceMessage;
    const retry = persistenceStatus === 'failed' || syncStatus.state === 'waiting' || syncStatus.state === 'offline'
      ? '<button type="button" class="lee_lee_diabetes_status_retry" data-action="retry-save">Retry</button>'
      : '';
    return `
      <p class="lee_lee_diabetes_save_status lee_lee_diabetes_save_status--${escapeHtml(statusClass)}" aria-live="polite">
        ${escapeHtml(statusMessage)}
        ${retry}
      </p>
    `;
  }

  function renderConfigurationNeeded() {
    const root = getRoot();
    if (!root) return;
    root.innerHTML = `
      <section class="lee_lee_diabetes_editor" aria-labelledby="lee-lee-diabetes-title">
        <h1 class="lee_lee_diabetes_editor_title" id="lee-lee-diabetes-title">Sync Setup Needed</h1>
        <p class="lee_lee_diabetes_help">Lee-Lee’s Tracker needs the Supabase project URL and publishable key before shared family records can open on this device.</p>
        <p class="lee_lee_diabetes_help">Add the browser-safe values described in <code>docs/SUPABASE_SETUP.md</code>. Do not use a service-role key or database password.</p>
      </section>
    `;
  }

  function renderSignIn() {
    const root = getRoot();
    if (!root) return;
    root.innerHTML = `
      <form class="lee_lee_diabetes_editor" data-auth-form aria-labelledby="lee-lee-diabetes-title">
        <h1 class="lee_lee_diabetes_editor_title" id="lee-lee-diabetes-title">Sign In</h1>
        <p class="lee_lee_diabetes_help">Use the shared Lee-Lee’s Tracker account to sync records on both phones.</p>
        ${authError ? `<p class="lee_lee_diabetes_error">${escapeHtml(authError)}</p>` : ''}
        ${authMessage ? `<p class="lee_lee_diabetes_save_status lee_lee_diabetes_save_status--synced">${escapeHtml(authMessage)}</p>` : ''}
        <label class="lee_lee_diabetes_field">
          Email
          <input class="lee_lee_diabetes_input" name="email" type="email" autocomplete="email" required>
        </label>
        <label class="lee_lee_diabetes_field">
          Password
          <input class="lee_lee_diabetes_input" name="password" type="password" autocomplete="current-password" required>
        </label>
        <div class="lee_lee_diabetes_actions">
          <button type="submit" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary">Sign In</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="reset-password">Reset Password</button>
        </div>
      </form>
    `;
    root.querySelector('[name="email"]')?.focus();
  }

  function renderDeviceIdentitySetup(errorMessage = '') {
    const root = getRoot();
    if (!root) return;
    root.innerHTML = `
      <form class="lee_lee_diabetes_editor" data-device-identity-form aria-labelledby="lee-lee-diabetes-title">
        <h1 class="lee_lee_diabetes_editor_title" id="lee-lee-diabetes-title">Who Uses This Device?</h1>
        <p class="lee_lee_diabetes_help">This labels who entered or edited records from this phone. It is separate from the shared sign-in account.</p>
        ${errorMessage ? `<p class="lee_lee_diabetes_error">${escapeHtml(errorMessage)}</p>` : ''}
        <label class="lee_lee_diabetes_field">
          This device is used by
          <select class="lee_lee_diabetes_select" name="deviceIdentity" required>
            <option value="">Choose one</option>
            <option value="Rolando">Rolando</option>
            <option value="Emily">Emily</option>
            <option value="Unknown">Unknown</option>
          </select>
        </label>
        <div class="lee_lee_diabetes_actions">
          <button type="submit" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary">Continue</button>
        </div>
      </form>
    `;
  }

  function renderConflicts() {
    const root = getRoot();
    if (!root || !syncRepository) return;
    currentEditor = { mode: 'conflicts' };
    conflictAutoResolvedCount += syncRepository.cleanupIdenticalConflicts?.() || 0;
    const conflicts = syncRepository.getConflicts();
    conflictSelection = new Set([...conflictSelection].filter((id) => conflicts.some((conflict) => conflict.recordId === id)));
    const selectedCount = conflictSelection.size;
    root.innerHTML = `
      <section class="lee_lee_diabetes_top">
        <p class="lee_lee_diabetes_date">Sync</p>
        <h1 class="lee_lee_diabetes_title" id="lee-lee-diabetes-title">Records Needing Review</h1>
        ${renderPersistenceStatus()}
      </section>
      ${renderTrackerNav('settings')}
      <section class="lee_lee_diabetes_settings_section" aria-labelledby="lee-lee-conflict-summary-title">
        <h2 class="lee_lee_diabetes_section_title" id="lee-lee-conflict-summary-title">${escapeHtml(conflicts.length)} ${conflicts.length === 1 ? 'conflict needs' : 'conflicts need'} review</h2>
        <p class="lee_lee_diabetes_help" aria-live="polite">${escapeHtml(selectedCount)} selected</p>
        ${conflictAutoResolvedCount ? `<p class="lee_lee_diabetes_save_status lee_lee_diabetes_save_status--synced">${escapeHtml(conflictAutoResolvedCount)} identical ${conflictAutoResolvedCount === 1 ? 'conflict' : 'conflicts'} resolved automatically.</p>` : ''}
        ${conflictBulkState ? `<p class="lee_lee_diabetes_save_status lee_lee_diabetes_save_status--${escapeHtml(conflictBulkState.state)}">${escapeHtml(conflictBulkState.message)}</p>` : ''}
        <div class="lee_lee_diabetes_backup_actions">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="select-all-conflicts" ${conflicts.length ? '' : 'disabled'}>Select All</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="select-no-conflicts" ${selectedCount ? '' : 'disabled'}>Select None</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="bulk-keep-shared" ${selectedCount ? '' : 'disabled'}>Keep Shared (${escapeHtml(selectedCount)})</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary" data-action="bulk-use-local" ${selectedCount ? '' : 'disabled'}>Use This Device (${escapeHtml(selectedCount)})</button>
        </div>
      </section>
      <section class="lee_lee_diabetes_timeline" aria-label="Sync conflicts">
        ${conflicts.length ? conflicts.map(renderConflictCard).join('') : '<p class="lee_lee_diabetes_empty" role="status">No conflicts need review.</p>'}
      </section>
    `;
  }

  function formatConflictValue(value, formatter = null) {
    if (formatter) return formatter(value) || 'None';
    return value == null || value === '' ? 'None' : String(value);
  }

  function getConflictRows(conflict) {
    const local = conflict.localRecord || {};
    const shared = conflict.sharedRecord || {};
    if (conflict.entityType === 'shared-settings') {
      return [
        ['Patient Name', shared.patientName, local.patientName],
        ['Date of Birth', shared.patientBirthDate, local.patientBirthDate],
        ['Clinic Name', shared.clinicName, local.clinicName],
        ['Clinic Phone', shared.clinicPhone, local.clinicPhone],
      ];
    }
    return [
      ['Time', formatRecordDateTime(shared.recordTimestamp), formatRecordDateTime(local.recordTimestamp)],
      ['Entry Type', shared.type, local.type],
      ['Blood Sugar', formatConflictValue(shared.bloodSugar, formatBloodSugar), formatConflictValue(local.bloodSugar, formatBloodSugar)],
      ['Insulin', formatConflictValue(getRecordActualInsulin(shared), formatInsulin), formatConflictValue(getRecordActualInsulin(local), formatInsulin)],
      ['Notes', shared.notes || '', local.notes || ''],
      ['Deleted', shared.deletedAt ? 'Deleted' : 'Active', local.deletedAt ? 'Deleted' : 'Active'],
    ];
  }

  function renderConflictCard(conflict) {
    const local = conflict.localRecord || {};
    const shared = conflict.sharedRecord || {};
    const isSelected = conflictSelection.has(conflict.recordId);
    const rows = getConflictRows(conflict);
    const title = conflict.entityType === 'shared-settings'
      ? 'Patient & Clinic Settings'
      : (local.type || shared.type || 'Entry');
    return `
      <article class="lee_lee_diabetes_timeline_item lee_lee_diabetes_history_record">
        <div>
          <label class="lee_lee_diabetes_checkline">
            <span class="lee_lee_diabetes_timeline_type">${escapeHtml(title)}</span>
            <input type="checkbox" data-conflict-select="${escapeHtml(conflict.recordId)}" aria-label="Select ${escapeHtml(title)} conflict" ${isSelected ? 'checked' : ''}>
          </label>
          <div class="lee_lee_diabetes_record_details">
            ${conflict.entityType === 'shared-settings' ? '' : `<p>${escapeHtml(formatRecordDateTime(local.recordTimestamp || shared.recordTimestamp))}</p>`}
            <p><strong>Shared:</strong> edited by ${escapeHtml(shared.lastEditedBy || shared.enteredBy || 'Unknown')}</p>
            <p><strong>This device:</strong> edited by ${escapeHtml(local.lastEditedBy || local.enteredBy || 'Unknown')}</p>
            <dl class="lee_lee_diabetes_conflict_grid">
              ${rows.map(([label, sharedValue, localValue]) => {
                const differs = String(sharedValue || '') !== String(localValue || '');
                return `
                  <div class="${differs ? 'is-different' : ''}">
                    <dt>${escapeHtml(label)}</dt>
                    <dd><strong>Shared</strong><span>${escapeHtml(formatConflictValue(sharedValue))}</span></dd>
                    <dd><strong>This device</strong><span>${escapeHtml(formatConflictValue(localValue))}</span></dd>
                  </div>
                `;
              }).join('')}
            </dl>
          </div>
        </div>
        <div class="lee_lee_diabetes_record_actions">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="keep-shared-version" data-id="${escapeHtml(conflict.recordId)}">Keep Shared</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary" data-action="use-local-version" data-id="${escapeHtml(conflict.recordId)}">Use This Device</button>
        </div>
      </article>
    `;
  }

  async function resolveSelectedConflicts(mode) {
    if (!syncRepository || !conflictSelection.size) return;
    const selectedIds = [...conflictSelection];
    const actionLabel = mode === 'keep-shared' ? 'Keep Shared' : 'Use This Device';
    if (selectedIds.length > 1) {
      const message = mode === 'keep-shared'
        ? `Keep the shared version for ${selectedIds.length} selected entries?`
        : `Replace the shared history with this device’s version for ${selectedIds.length} selected entries?`;
      if (!window.confirm(message)) return;
    }
    conflictBulkState = { state: 'syncing', message: `Resolving 0 of ${selectedIds.length}…` };
    renderConflicts();
    let resolved = 0;
    for (const id of selectedIds) {
      conflictBulkState = { state: 'syncing', message: `Resolving ${resolved + 1} of ${selectedIds.length}…` };
      renderConflicts();
      if (mode === 'keep-shared') await syncRepository.keepSharedVersion(id);
      else await syncRepository.useLocalVersion(id);
      resolved += 1;
    }
    const remainingSelected = syncRepository.getConflicts().filter((conflict) => selectedIds.includes(conflict.recordId)).length;
    const resolvedCount = selectedIds.length - remainingSelected;
    conflictSelection = new Set(selectedIds.filter((id) => syncRepository.getConflicts().some((conflict) => conflict.recordId === id)));
    conflictBulkState = {
      state: remainingSelected ? 'waiting' : 'synced',
      message: `${resolvedCount} resolved. ${remainingSelected} ${remainingSelected === 1 ? 'still needs' : 'still need'} review.`,
    };
    syncStatus = syncRepository.getSyncStatus();
    renderConflicts();
  }

  function createBackupDocument() {
    return {
      appIdentifier: 'lee-lee-tracker-full-backup',
      backupFormat: 'lee-lee-tracker-full-backup',
      backupFormatVersion: 1,
      appVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      recordCount: trackerData.records.length,
      ...normalizeTrackerDataDocument(trackerData),
    };
  }

  function exportDataBackup() {
    const backup = createBackupDocument();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const now = new Date();
    const stamp = `${getLocalDateKey(now)}-${getLocalTimeKey(now).replace(':', '')}`;
    link.href = URL.createObjectURL(blob);
    link.download = `lee-lee-tracker-backup-${stamp}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    try {
      localStorage.setItem(`${TRACKER_STORAGE_KEY}:last-full-backup-at`, new Date().toISOString());
    } catch (error) {
      // Backup reminder state is best effort.
    }
  }

  function validateBackupPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return { error: 'Choose a valid Lee-Lee’s Tracker backup file.' };
    }
    const candidate = payload.appIdentifier === 'lando-world:lee-lees-tracker'
      ? payload
      : migrateLegacyPayload('backup', payload);
    if (!candidate || typeof candidate !== 'object') {
      return { error: 'Choose a valid Lee-Lee’s Tracker backup file.' };
    }
    const normalized = normalizeTrackerDataDocument(candidate);
    const hasData = normalized.records.length || normalized.insulinPlans.length;
    if (!hasData) return { error: 'That backup did not contain tracker records or insulin plans.' };
    return { data: normalized };
  }

  function renderImportConfirmation(importData) {
    const root = getRoot();
    if (!root) return;
    currentEditor = {
      mode: 'import-confirmation',
      pendingImport: importData,
    };
    root.innerHTML = `
      <section class="lee_lee_diabetes_editor" aria-labelledby="lee-lee-diabetes-title">
        <h1 class="lee_lee_diabetes_editor_title" id="lee-lee-diabetes-title">Import Data Backup</h1>
        <p class="lee_lee_diabetes_help">The backup will be merged with data already on this device. Matching records will not be duplicated.</p>
        <dl class="lee_lee_diabetes_confirm_list">
          <div>
            <dt>Records found</dt>
            <dd>${escapeHtml(importData.records.length)}</dd>
          </div>
          <div>
            <dt>Insulin plans found</dt>
            <dd>${escapeHtml(importData.insulinPlans.length)}</dd>
          </div>
        </dl>
        <div class="lee_lee_diabetes_actions">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="settings">Cancel</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary" data-action="confirm-import">Import Backup</button>
        </div>
      </section>
    `;
  }

  function handleBackupImport(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      try {
        const payload = JSON.parse(String(reader.result || ''));
        const validation = validateBackupPayload(payload);
        if (validation.error) {
          renderSettings(validation.error);
          return;
        }
        renderImportConfirmation(validation.data);
      } catch (error) {
        renderSettings('Choose a valid Lee-Lee’s Tracker backup file.');
      }
    });
    reader.readAsText(file);
  }

  function preservePreImportBackup() {
    if (!storageAvailability.available) return false;
    try {
      localStorage.setItem(`${PRE_IMPORT_BACKUP_PREFIX}${Date.now()}`, JSON.stringify(createBackupDocument()));
      return true;
    } catch (error) {
      console.warn('Lee-Lee’s Tracker pre-import backup could not be saved.');
      return false;
    }
  }

  function confirmImportBackup() {
    const importData = currentEditor?.pendingImport;
    if (!importData) return;
    if (!preservePreImportBackup()) {
      setPersistenceStatus('failed');
      renderSettings('Import stopped because a pre-import backup could not be saved on this device.');
      return;
    }
    setPersistenceStatus('saving');
    const result = updateTrackerData((current) => mergeTrackerDocuments(current, importData));
    if (result.ok) setPersistenceStatus('imported');
    renderSettings();
  }

  function retrySave() {
    setPersistenceStatus('saving');
    saveTrackerData(trackerData);
    renderHome();
  }

  function requestPersistentStorage() {
    if (!navigator.storage?.persist) return;
    const dismissedKey = `${TRACKER_STORAGE_KEY}:persistent-storage-requested`;
    try {
      if (localStorage.getItem(dismissedKey) === 'true') return;
      navigator.storage.persist().finally(() => {
        try {
          localStorage.setItem(dismissedKey, 'true');
        } catch (error) {
          // Persistence is best effort; localStorage remains the required source of truth.
        }
      });
    } catch (error) {
      // Some browsers restrict this API. The tracker still works with ordinary localStorage.
    }
  }

  function handleExternalStorageUpdate(event) {
    if (event.key !== TRACKER_STORAGE_KEY || !event.newValue) return;
    try {
      const incoming = JSON.parse(event.newValue);
      trackerData = mergeTrackerDocuments(trackerData, incoming);
      records = trackerData.records;
      insulinPlans = trackerData.insulinPlans;
      setPersistenceStatus('reloaded');
      if (!currentEditor || currentEditor.mode === 'settings') {
        if (currentEditor?.mode === 'settings') {
          renderSettings();
        } else {
          renderHome();
        }
      }
    } catch (error) {
      console.warn('Lee-Lee’s Tracker received an unreadable storage update.');
    }
  }

  function getPlanTimestampRange(plan) {
    return {
      start: createDateStartTimestamp(plan.effectiveFrom) ?? Number.NEGATIVE_INFINITY,
      end: plan.effectiveTo ? createDateStartTimestamp(plan.effectiveTo) : Number.POSITIVE_INFINITY,
    };
  }

  function getActiveInsulinPlan(recordTimestamp = Date.now()) {
    return insulinPlans
      .map((plan) => ({ plan, range: getPlanTimestampRange(plan) }))
      .filter(({ range }) => recordTimestamp >= range.start && recordTimestamp < range.end)
      .sort((a, b) => b.range.start - a.range.start)[0]?.plan || null;
  }

  function calculateMealInsulinDose({ bloodSugar, entryType, insulinPlan, recordTimestamp }) {
    const glucoseText = String(bloodSugar ?? '').trim();
    if (!MEAL_TYPES.includes(entryType) || !insulinPlan?.supportedMealTypes?.includes(entryType)) {
      if (MEAL_TYPES.includes(entryType) && !insulinPlan) {
        return {
          status: 'unavailable',
          baseUnits: null,
          correctionUnits: null,
          suggestedTotalUnits: null,
          matchedRange: null,
          insulinPlanId: null,
          message: 'No insulin plan is configured for this date.',
        };
      }
      return {
        status: 'unsupported-entry-type',
        baseUnits: null,
        correctionUnits: null,
        suggestedTotalUnits: null,
        matchedRange: null,
        insulinPlanId: insulinPlan?.id || null,
        message: 'Automatic dose guidance is available only for Breakfast, Lunch, and Dinner under the current plan.',
      };
    }
    if (!insulinPlan || !Number.isFinite(Number(recordTimestamp))) {
      return {
        status: 'unavailable',
        baseUnits: null,
        correctionUnits: null,
        suggestedTotalUnits: null,
        matchedRange: null,
        insulinPlanId: insulinPlan?.id || null,
        message: 'No insulin plan is configured for this date.',
      };
    }
    if (!isWholePositiveGlucose(glucoseText)) {
      return {
        status: 'unavailable',
        baseUnits: null,
        correctionUnits: null,
        suggestedTotalUnits: null,
        matchedRange: null,
        insulinPlanId: insulinPlan.id,
        message: 'Enter a positive whole-number blood sugar to see a suggested dose.',
      };
    }
    const glucose = Number(glucoseText);
    const matches = insulinPlan.correctionRanges.filter((range) => {
      const aboveMinimum = range.minGlucose == null || glucose >= range.minGlucose;
      const belowMaximum = range.maxGlucose == null || glucose <= range.maxGlucose;
      return aboveMinimum && belowMaximum;
    });
    if (matches.length !== 1) {
      return {
        status: 'outside-configured-range',
        baseUnits: null,
        correctionUnits: null,
        suggestedTotalUnits: null,
        matchedRange: null,
        insulinPlanId: insulinPlan.id,
        message: 'Reading is outside the configured correction table.',
      };
    }
    const matchedRange = matches[0];
    const baseUnits = Number(insulinPlan.mealBaseUnits);
    const correctionUnits = Number(matchedRange.correctionUnits);
    return {
      status: 'calculated',
      baseUnits,
      correctionUnits,
      suggestedTotalUnits: baseUnits + correctionUnits,
      matchedRange: { ...matchedRange },
      insulinPlanId: insulinPlan.id,
      message: 'Based on the current clinician-provided insulin plan. Confirm the dose before giving insulin.',
    };
  }

  window.LeeLeeTrackerDoseHelper = {
    calculateMealInsulinDose,
  };

  window.LeeLeeTrackerEntryTypes = {
    all: ENTRY_TYPE_DEFINITIONS.map((definition) => ({ ...definition, fields: [...definition.fields] })),
    primaryTypes: [...PRIMARY_TYPES],
    mealTypes: [...MEAL_TYPES],
    getEntryTypeConfig: (type) => {
      const config = getEntryTypeConfig(type);
      return { ...config, fields: [...config.fields] };
    },
    entryTypeUsesMealGuidance,
    entryTypeHasField,
  };

  function getRecordEventDateKey(record) {
    return getLocalDateKey(new Date(getRecordTimestamp(record)));
  }

  function getRecordActualInsulin(record) {
    return normalizeNumber(record?.administeredInsulinUnits ?? record?.insulinUnits);
  }

  function sortRecordsChronologically(sourceRecords) {
    return sourceRecords
      .slice()
      .sort((a, b) => getRecordTimestamp(a) - getRecordTimestamp(b));
  }

  function sortRecordsNewestFirst(sourceRecords) {
    return sourceRecords
      .slice()
      .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
  }

  function addDays(dateKey, delta) {
    const timestamp = createDateStartTimestamp(dateKey);
    if (timestamp == null) return '';
    return getLocalDateKey(new Date(timestamp + delta * 24 * 60 * 60 * 1000));
  }

  function getDateRangeBounds(rangeValue, startDate = '', endDate = '') {
    const today = getLocalDateKey();
    const option = DATE_RANGE_OPTIONS.find((item) => item.value === rangeValue);
    if (rangeValue === 'custom') {
      return {
        startDate: /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : '',
        endDate: /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : '',
      };
    }
    if (!option || option.days == null) {
      return { startDate: '', endDate: '' };
    }
    return {
      startDate: addDays(today, -(option.days - 1)),
      endDate: today,
    };
  }

  function filterRecordsByDateRange(sourceRecords, filters) {
    const bounds = getDateRangeBounds(filters.range, filters.startDate, filters.endDate);
    return sourceRecords.filter((record) => {
      const dateKey = getRecordEventDateKey(record);
      const afterStart = !bounds.startDate || dateKey >= bounds.startDate;
      const beforeEnd = !bounds.endDate || dateKey <= bounds.endDate;
      return afterStart && beforeEnd;
    });
  }

  function filterRecordsByEntryType(sourceRecords, type) {
    if (!type || type === 'All') return sourceRecords;
    return sourceRecords.filter((record) => record.type === type);
  }

  function getFilteredRecords(sourceRecords, filters) {
    return filterRecordsByEntryType(filterRecordsByDateRange(sourceRecords, filters), filters.type);
  }

  function groupRecordsByLocalDate(sourceRecords) {
    const groups = new Map();
    sortRecordsChronologically(sourceRecords).forEach((record) => {
      const dateKey = getRecordEventDateKey(record);
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey).push(record);
    });
    return [...groups.entries()]
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .map(([dateKey, dateRecords]) => ({
        dateKey,
        records: sortRecordsChronologically(dateRecords),
      }));
  }

  const dailySummaryCache = new Map();

  function getDailySummaryCacheKey(sourceRecords) {
    return sourceRecords
      .slice()
      .sort((a, b) => getRecordTimestamp(a) - getRecordTimestamp(b) || String(a.id || '').localeCompare(String(b.id || '')))
      .map((record) => [
        record.id,
        record.bloodSugar ?? '',
        getRecordActualInsulin(record) ?? '',
        record.updatedAt ?? '',
      ].join(':'))
      .join('|');
  }

  function calculateDailySummary(sourceRecords) {
    const cacheKey = getDailySummaryCacheKey(sourceRecords);
    if (dailySummaryCache.has(cacheKey)) return dailySummaryCache.get(cacheKey);
    const glucoseValues = sourceRecords
      .map((record) => normalizeBloodSugar(record.bloodSugar))
      .filter((value) => value != null);
    const insulinValues = sourceRecords
      .map(getRecordActualInsulin)
      .filter((value) => value != null);
    const totalGlucose = glucoseValues.reduce((sum, value) => sum + value, 0);
    const totalInsulin = insulinValues.reduce((sum, value) => sum + value, 0);
    const summary = {
      entryCount: sourceRecords.length,
      averageBloodSugar: glucoseValues.length ? Math.round(totalGlucose / glucoseValues.length) : null,
      highestBloodSugar: glucoseValues.length ? Math.max(...glucoseValues) : null,
      lowestBloodSugar: glucoseValues.length ? Math.min(...glucoseValues) : null,
      totalInsulin: insulinValues.length ? totalInsulin : null,
    };
    dailySummaryCache.set(cacheKey, summary);
    return summary;
  }

  function getDailySummaryCacheSize() {
    return dailySummaryCache.size;
  }

  function buildClinicalLog(sourceRecords) {
    return groupRecordsByLocalDate(sourceRecords).map((group) => {
      const usedIds = new Set();
      const primary = {};
      PRIMARY_TYPES.forEach((type) => {
        const record = group.records.find((item) => item.type === type && !usedIds.has(item.id));
        if (record) {
          primary[type] = record;
          usedIds.add(record.id);
        }
      });
      return {
        ...group,
        primary,
        additionalRecords: group.records.filter((record) => !usedIds.has(record.id)),
        summary: calculateDailySummary(group.records),
      };
    });
  }

  function buildDetailedReport(sourceRecords) {
    return groupRecordsByLocalDate(sourceRecords).map((group) => ({
      ...group,
      summary: calculateDailySummary(group.records),
    }));
  }

  function buildClinicalReport(sourceRecords) {
    return {
      id: 'clinical',
      title: 'Clinical Log',
      groups: buildClinicalLog(sourceRecords),
    };
  }

  function buildDetailedReportData(sourceRecords) {
    return {
      id: 'detailed',
      title: 'Detailed Report',
      groups: buildDetailedReport(sourceRecords),
    };
  }

  const REPORT_REGISTRY = [
    {
      id: 'clinical',
      title: 'Clinical Log',
      description: 'A compact table modeled after a paper blood-sugar log.',
      builder: buildClinicalReport,
      printLayout: 'landscape',
    },
    {
      id: 'detailed',
      title: 'Detailed Report',
      description: 'Every selected record with dose details and notes.',
      builder: buildDetailedReportData,
      printLayout: 'portrait',
    },
  ];

  function getReportDefinition(reportId) {
    return REPORT_REGISTRY.find((report) => report.id === reportId) || REPORT_REGISTRY[0];
  }

  function isRecordDeleted(record) {
    return Boolean(record?.deletedAt || record?.deleted_at);
  }

  function activeRecords() {
    return records.filter((record) => !isRecordDeleted(record));
  }

  function deletedRecords() {
    return sortRecordsNewestFirst(records.filter(isRecordDeleted));
  }

  function getHistoryInitialWindowDays() {
    const value = trackerData.settings?.historyInitialWindowDays;
    if (value === 'all') return null;
    const numeric = Number(value);
    return HISTORY_WINDOW_OPTIONS.some((option) => option.days === numeric)
      ? numeric
      : DEFAULT_HISTORY_WINDOW_DAYS;
  }

  function resetHistoryVisibleWindow() {
    historyVisibleDayCount = getHistoryInitialWindowDays();
  }

  function getVisibleHistoryGroups(groups, visibleDayCount) {
    if (visibleDayCount == null) return groups;
    return groups.slice(0, visibleDayCount);
  }

  function getHistoryFilterCount(filters) {
    return [
      filters.range !== 'all',
      filters.type !== 'All',
    ].filter(Boolean).length;
  }

  function getHistoryVisibleSummary(groups) {
    const dayCount = groups.length;
    const entryCount = groups.reduce((count, group) => count + group.records.length, 0);
    return `${dayCount} ${dayCount === 1 ? 'Day' : 'Days'} • ${entryCount} ${entryCount === 1 ? 'Entry' : 'Entries'}`;
  }

  function getTodaysActivityRecords(sourceRecords, todayDateKey = getLocalDateKey()) {
    return sourceRecords
      .filter((record) => !isRecordDeleted(record))
      .filter((record) => getRecordEventDateKey(record) === todayDateKey)
      .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
  }

  function formatDateKey(dateKey) {
    const timestamp = createDateStartTimestamp(dateKey);
    return timestamp == null ? dateKey : formatDate(new Date(timestamp));
  }

  function formatShortDateKey(dateKey) {
    const timestamp = createDateStartTimestamp(dateKey);
    if (timestamp == null) return dateKey;
    return new Intl.DateTimeFormat(navigator.language || undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(timestamp));
  }

  function formatDateRangeText(filters) {
    const filtered = filterRecordsByDateRange(records, filters);
    const bounds = getDateRangeBounds(filters.range, filters.startDate, filters.endDate);
    if (!filtered.length) {
      if (bounds.startDate && bounds.endDate) return `${formatShortDateKey(bounds.startDate)} through ${formatShortDateKey(bounds.endDate)}`;
      return 'the selected range';
    }
    const dateKeys = filtered.map(getRecordEventDateKey).sort();
    return `${formatShortDateKey(dateKeys[0])} through ${formatShortDateKey(dateKeys[dateKeys.length - 1])}`;
  }

  function formatSummaryValue(value, formatter, fallback = 'No data') {
    return value == null ? fallback : formatter(value);
  }

  function todaysRecords() {
    return getTodaysActivityRecords(records);
  }

  function latestRecordForType(type) {
    return todaysRecords().find((record) => record.type === type) || null;
  }

  function formatBloodSugar(value) {
    return value == null ? '' : `${value} mg/dL`;
  }

  function formatInsulin(value) {
    if (value == null) return '';
    return `${value} ${value === 1 ? 'unit' : 'units'}`;
  }

  function formatRange(range) {
    if (!range) return '';
    if (range.minGlucose == null) return `Below ${Number(range.maxGlucose) + 1} mg/dL`;
    if (range.maxGlucose == null) return `${range.minGlucose}+ mg/dL`;
    return `${range.minGlucose}-${range.maxGlucose} mg/dL`;
  }

  function formatRecordDateTime(timestamp) {
    const date = new Date(timestamp);
    return `${formatDate(date)} at ${formatTime(timestamp)}`;
  }

  function getMealDoseSummary(record) {
    if (!record || record.doseCalculationStatus !== 'calculated' || record.suggestedTotalUnits == null) return '';
    const given = formatInsulin(record.administeredInsulinUnits ?? record.insulinUnits) || 'No insulin';
    const suggested = formatInsulin(record.suggestedTotalUnits);
    const breakdown = `${formatInsulin(record.suggestedBaseUnits)} base + ${formatInsulin(record.suggestedCorrectionUnits)} correction`;
    return `Given: ${given} · Suggested: ${suggested} · ${breakdown}`;
  }

  function renderValuePills(record) {
    if (!record) return '';
    const values = [
      formatBloodSugar(record.bloodSugar),
      formatInsulin(getRecordActualInsulin(record)),
    ].filter(Boolean);
    return values.length
      ? `<div class="lee_lee_diabetes_card_values">${values.map((value) => `<span class="lee_lee_diabetes_pill">${escapeHtml(value)}</span>`).join('')}</div>`
      : '';
  }

  function getTrackerNavLabel(active) {
    return TRACKER_NAV_ITEMS.find(([action]) => action === active)?.[1] || 'Menu';
  }

  function renderTrackerNav(active) {
    return `
      <div class="lee_lee_diabetes_nav_shell ${trackerMenuOpen ? 'is-open' : ''}">
        <button
          type="button"
          class="lee_lee_diabetes_mobile_nav_button"
          data-action="toggle-tracker-nav"
          aria-controls="lee-lee-diabetes-nav"
          aria-expanded="${trackerMenuOpen ? 'true' : 'false'}"
        >
          <span>${escapeHtml(getTrackerNavLabel(active))}</span>
          <span aria-hidden="true">☰</span>
        </button>
        <nav class="lee_lee_diabetes_nav" id="lee-lee-diabetes-nav" aria-label="Lee-Lee’s Tracker sections">
          ${TRACKER_NAV_ITEMS.map(([action, label]) => `
            <button
              type="button"
              class="lee_lee_diabetes_nav_button ${active === action ? 'is-active' : ''}"
              data-action="${escapeHtml(action)}"
              aria-current="${active === action ? 'page' : 'false'}"
            >${escapeHtml(label)}</button>
          `).join('')}
        </nav>
      </div>
    `;
  }

  function renderHome() {
    currentEditor = null;
    const root = getRoot();
    if (!root) return;
    const timeline = todaysRecords();
    root.innerHTML = `
      <section class="lee_lee_diabetes_top">
        <p class="lee_lee_diabetes_date">${escapeHtml(formatDate())}</p>
        <h1 class="lee_lee_diabetes_title" id="lee-lee-diabetes-title">Lee-Lee’s Tracker</h1>
        ${renderPersistenceStatus()}
      </section>
      ${renderTrackerNav('today')}
      <section class="lee_lee_diabetes_today_actions" aria-label="Log an entry">
        <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary lee_lee_diabetes_log_entry_button" data-action="log-entry">+ Log Entry</button>
      </section>
      <section aria-labelledby="lee-lee-diabetes-timeline-title">
        <h2 class="lee_lee_diabetes_section_title" id="lee-lee-diabetes-timeline-title">Today’s Activity</h2>
        ${timeline.length ? `<div class="lee_lee_diabetes_timeline">${timeline.map(renderTimelineItem).join('')}</div>` : '<p class="lee_lee_diabetes_empty">No entries today.</p>'}
      </section>
    `;
  }

  function renderPrimaryCard(type) {
    const record = latestRecordForType(type);
    const isComplete = Boolean(record);
    return `
      <button type="button" class="lee_lee_diabetes_card ${isComplete ? 'is-complete' : ''}" data-action="edit-primary" data-type="${escapeHtml(type)}">
        <span>
          <span class="lee_lee_diabetes_card_title">${escapeHtml(type)}</span>
          <span class="lee_lee_diabetes_card_status">${isComplete ? '✓ Completed' : '○ Not recorded'}</span>
          ${renderValuePills(record)}
        </span>
        <span class="lee_lee_diabetes_card_icon" aria-hidden="true">${isComplete ? '✓' : '+'}</span>
      </button>
    `;
  }

  function renderTimelineItem(record) {
    const notes = record.notes
      ? `<div class="lee_lee_diabetes_timeline_notes">${escapeHtml(record.notes)}</div>`
      : '';
    const doseSummary = getMealDoseSummary(record)
      ? `<div class="lee_lee_diabetes_timeline_notes">${escapeHtml(getMealDoseSummary(record))}</div>`
      : '';
    return `
      <article class="lee_lee_diabetes_timeline_item lee_lee_diabetes_timeline_item--today">
        <div>
          <div class="lee_lee_diabetes_timeline_type">${escapeHtml(record.type)}</div>
          <div class="lee_lee_diabetes_timeline_values">${escapeHtml(formatBloodSugar(record.bloodSugar) || 'No blood sugar')} · ${escapeHtml(formatInsulin(record.insulinUnits) || 'No insulin')}</div>
          ${doseSummary}
          ${notes}
        </div>
        <div class="lee_lee_diabetes_timeline_footer">
          <time class="lee_lee_diabetes_timeline_time" datetime="${escapeHtml(new Date(getRecordTimestamp(record)).toISOString())}">${escapeHtml(formatTime(getRecordTimestamp(record)))}</time>
          <button type="button" class="lee_lee_diabetes_timeline_edit" data-action="edit-today-record" data-id="${escapeHtml(record.id)}">Edit</button>
        </div>
      </article>
    `;
  }

  function renderFilterControls(filters, scope) {
    const prefix = scope === 'export' ? 'export' : 'history';
    const dateOptions = (scope === 'export' ? EXPORT_RANGE_OPTIONS : DATE_RANGE_OPTIONS)
      .map((option) => `<option value="${escapeHtml(option.value)}" ${filters.range === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`)
      .join('');
    const typeControl = scope === 'history'
      ? `
        <label class="lee_lee_diabetes_field">
          Entry Type
          <select class="lee_lee_diabetes_select" name="type" data-filter-scope="${prefix}">
            ${['All', ...EXTRA_TYPES].map((type) => `<option value="${escapeHtml(type)}" ${filters.type === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
          </select>
        </label>
      `
      : '';
    return `
      <form class="lee_lee_diabetes_filters" data-${prefix}-filters>
        <label class="lee_lee_diabetes_field">
          Date Range
          <select class="lee_lee_diabetes_select" name="range" data-filter-scope="${prefix}">
            ${dateOptions}
          </select>
        </label>
        ${typeControl}
        <label class="lee_lee_diabetes_field ${filters.range === 'custom' ? '' : 'is-hidden'}" data-custom-range-field="${prefix}">
          Start Date
          <input class="lee_lee_diabetes_input" name="startDate" type="date" value="${escapeHtml(filters.startDate || '')}" data-filter-scope="${prefix}">
        </label>
        <label class="lee_lee_diabetes_field ${filters.range === 'custom' ? '' : 'is-hidden'}" data-custom-range-field="${prefix}">
          End Date
          <input class="lee_lee_diabetes_input" name="endDate" type="date" value="${escapeHtml(filters.endDate || '')}" data-filter-scope="${prefix}">
        </label>
      </form>
    `;
  }

  function renderHistoryFilterTrigger(visibleGroups) {
    const count = getHistoryFilterCount(historyFilters);
    return `
      <div class="lee_lee_diabetes_history_filter_bar">
        <p class="lee_lee_diabetes_filter_summary" aria-live="polite">${escapeHtml(getHistoryVisibleSummary(visibleGroups))}</p>
        <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost lee_lee_diabetes_filter_button" data-action="open-history-filters">
          Filters${count ? ` <span class="lee_lee_diabetes_filter_badge">${escapeHtml(count)}</span>` : ''}
        </button>
      </div>
    `;
  }

  function renderHistoryFilterSheet() {
    if (!historyFilterSheetOpen) return '';
    const filters = historyDraftFilters;
    return `
      <div class="lee_lee_diabetes_sheet_backdrop" data-action="cancel-history-filters"></div>
      <section class="lee_lee_diabetes_sheet" role="dialog" aria-modal="true" aria-labelledby="lee-lee-history-filter-title" data-history-filter-sheet>
        <h2 class="lee_lee_diabetes_editor_title" id="lee-lee-history-filter-title">History Filters</h2>
        <form class="lee_lee_diabetes_filters" data-history-filter-draft>
          <label class="lee_lee_diabetes_field">
            Date Range
            <select class="lee_lee_diabetes_select" name="range">
              ${DATE_RANGE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${filters.range === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
            </select>
          </label>
          <label class="lee_lee_diabetes_field">
            Entry Type
            <select class="lee_lee_diabetes_select" name="type">
              ${['All', ...EXTRA_TYPES].map((type) => `<option value="${escapeHtml(type)}" ${filters.type === type ? 'selected' : ''}>${escapeHtml(type === 'All' ? 'All Entry Types' : type)}</option>`).join('')}
            </select>
          </label>
          <label class="lee_lee_diabetes_field ${filters.range === 'custom' ? '' : 'is-hidden'}" data-custom-range-field="history-draft">
            Start Date
            <input class="lee_lee_diabetes_input" name="startDate" type="date" value="${escapeHtml(filters.startDate || '')}">
          </label>
          <label class="lee_lee_diabetes_field ${filters.range === 'custom' ? '' : 'is-hidden'}" data-custom-range-field="history-draft">
            End Date
            <input class="lee_lee_diabetes_input" name="endDate" type="date" value="${escapeHtml(filters.endDate || '')}">
          </label>
        </form>
        <div class="lee_lee_diabetes_actions">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="cancel-history-filters">Cancel</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="clear-history-filters">Clear Filters</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary" data-action="apply-history-filters">Apply</button>
        </div>
      </section>
    `;
  }

  function renderSummaryGrid(summary) {
    const items = [
      ['Entries', summary.entryCount],
      ['Average', formatSummaryValue(summary.averageBloodSugar, formatBloodSugar)],
      ['High', formatSummaryValue(summary.highestBloodSugar, formatBloodSugar)],
      ['Low', formatSummaryValue(summary.lowestBloodSugar, formatBloodSugar)],
      ['Total insulin', formatSummaryValue(summary.totalInsulin, formatInsulin)],
    ];
    return `
      <dl class="lee_lee_diabetes_summary_grid">
        ${items.map(([label, value]) => `
          <div>
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value)}</dd>
          </div>
        `).join('')}
      </dl>
    `;
  }

  function renderHistory() {
    currentEditor = { mode: 'history' };
    const root = getRoot();
    if (!root) return;
    if (historyVisibleDayCount === null && getHistoryInitialWindowDays() !== null) {
      resetHistoryVisibleWindow();
    }
    const visibleRecords = activeRecords();
    const filtered = getFilteredRecords(visibleRecords, historyFilters);
    const groups = groupRecordsByLocalDate(filtered);
    const visibleGroups = getVisibleHistoryGroups(groups, historyVisibleDayCount);
    const hasOlderGroups = visibleGroups.length < groups.length;
    const emptyMessage = visibleRecords.length
      ? `
        <p class="lee_lee_diabetes_empty" role="status">No records match these filters.</p>
        <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost lee_lee_diabetes_extra" data-action="reset-history-filters">Reset Filters</button>
      `
      : `
        <p class="lee_lee_diabetes_empty" role="status">No records yet.</p>
        <p class="lee_lee_diabetes_help">Saved blood-sugar and insulin entries will appear here.</p>
      `;
    root.innerHTML = `
      <section class="lee_lee_diabetes_top">
        <p class="lee_lee_diabetes_date">${escapeHtml(formatDate())}</p>
        <h1 class="lee_lee_diabetes_title" id="lee-lee-diabetes-title">History</h1>
        ${renderPersistenceStatus()}
      </section>
      ${renderTrackerNav('history')}
      ${renderHistoryFilterTrigger(visibleGroups)}
      <section class="lee_lee_diabetes_history_list" aria-label="History dates">
        ${visibleGroups.length ? visibleGroups.map(renderHistoryDateCard).join('') : emptyMessage}
      </section>
      ${hasOlderGroups ? `<button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost lee_lee_diabetes_extra" data-action="load-older-history">Load Older Records</button>` : ''}
      ${renderHistoryFilterSheet()}
    `;
    focusHistorySheet(root);
  }

  function renderHistoryDateCard(group) {
    const summary = calculateDailySummary(group.records);
    const types = [...new Set(group.records.map((record) => record.type))].join(' · ');
    return `
      <button type="button" class="lee_lee_diabetes_history_date" data-action="history-date" data-date="${escapeHtml(group.dateKey)}">
        <span>
          <span class="lee_lee_diabetes_card_title">${escapeHtml(formatDateKey(group.dateKey))}</span>
          <span class="lee_lee_diabetes_timeline_values">${escapeHtml(summary.entryCount)} ${summary.entryCount === 1 ? 'entry' : 'entries'} · Average: ${escapeHtml(formatSummaryValue(summary.averageBloodSugar, formatBloodSugar))} · Total insulin: ${escapeHtml(formatSummaryValue(summary.totalInsulin, formatInsulin))}</span>
          <span class="lee_lee_diabetes_timeline_notes">${escapeHtml(types)}</span>
        </span>
        <span class="lee_lee_diabetes_card_icon" aria-hidden="true">›</span>
      </button>
    `;
  }

  function renderHistoryDay(dateKey) {
    const root = getRoot();
    if (!root) return;
    const dayRecords = sortRecordsChronologically(activeRecords().filter((record) => getRecordEventDateKey(record) === dateKey));
    const summary = calculateDailySummary(dayRecords);
    currentEditor = {
      mode: 'history-day',
      dateKey,
    };
    root.innerHTML = `
      <section class="lee_lee_diabetes_top">
        <p class="lee_lee_diabetes_date">History</p>
        <h1 class="lee_lee_diabetes_title" id="lee-lee-diabetes-title">${escapeHtml(formatDateKey(dateKey))}</h1>
        ${renderPersistenceStatus()}
      </section>
      ${renderTrackerNav('history')}
      <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost lee_lee_diabetes_extra" data-action="history">← All Dates</button>
      ${renderSummaryGrid(summary)}
      <section class="lee_lee_diabetes_timeline" aria-label="Records for ${escapeHtml(formatDateKey(dateKey))}">
        ${dayRecords.length ? dayRecords.map(renderHistoryRecord).join('') : '<p class="lee_lee_diabetes_empty" role="status">No records match these filters.</p>'}
      </section>
    `;
  }

  function renderHistoryRecord(record) {
    const suggested = record.suggestedTotalUnits == null ? '' : formatInsulin(record.suggestedTotalUnits);
    const breakdown = record.suggestedBaseUnits == null && record.suggestedCorrectionUnits == null
      ? ''
      : `${formatInsulin(record.suggestedBaseUnits)} base + ${formatInsulin(record.suggestedCorrectionUnits)} correction`;
    const actual = getRecordActualInsulin(record);
    const differs = suggested && actual != null && Number(record.suggestedTotalUnits) !== Number(actual);
    const notes = record.notes ? `<p><strong>Notes:</strong> ${escapeHtml(record.notes)}</p>` : '';
    return `
      <article class="lee_lee_diabetes_timeline_item lee_lee_diabetes_history_record">
        <div>
          <div class="lee_lee_diabetes_timeline_type">${escapeHtml(record.type)}</div>
          <time class="lee_lee_diabetes_timeline_time" datetime="${escapeHtml(new Date(getRecordTimestamp(record)).toISOString())}">${escapeHtml(formatTime(getRecordTimestamp(record)))}</time>
          <div class="lee_lee_diabetes_record_details">
            <p><strong>Blood sugar:</strong> ${escapeHtml(formatBloodSugar(record.bloodSugar) || 'No blood sugar')}</p>
            <p><strong>Insulin given:</strong> ${escapeHtml(formatInsulin(actual) || 'No insulin')}</p>
            ${suggested ? `<p><strong>Suggested:</strong> ${escapeHtml(suggested)}${differs ? ' · differs from actual' : ''}</p>` : ''}
            ${breakdown ? `<p>${escapeHtml(breakdown)}</p>` : ''}
            ${notes}
          </div>
        </div>
        <div class="lee_lee_diabetes_record_actions">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="edit-record" data-id="${escapeHtml(record.id)}">Edit</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--danger" data-action="delete-record" data-id="${escapeHtml(record.id)}">Delete</button>
        </div>
      </article>
    `;
  }

  function renderDeleteConfirmation(record) {
    const root = getRoot();
    if (!root) return;
    currentEditor = {
      mode: 'delete-confirmation',
      pendingDeleteId: record.id,
      returnDateKey: getRecordEventDateKey(record),
    };
    const actual = getRecordActualInsulin(record);
    root.innerHTML = `
      <section class="lee_lee_diabetes_editor" aria-labelledby="lee-lee-diabetes-title" role="dialog" aria-modal="true">
        <h1 class="lee_lee_diabetes_editor_title" id="lee-lee-diabetes-title">Delete this record?</h1>
        <dl class="lee_lee_diabetes_confirm_list">
          <div>
            <dt>Entry</dt>
            <dd>${escapeHtml(record.type)}</dd>
          </div>
          <div>
            <dt>Date and time</dt>
            <dd>${escapeHtml(formatRecordDateTime(record.recordTimestamp))}</dd>
          </div>
          <div>
            <dt>Blood sugar</dt>
            <dd>${escapeHtml(formatBloodSugar(record.bloodSugar) || 'No blood sugar')}</dd>
          </div>
          <div>
            <dt>Insulin given</dt>
            <dd>${escapeHtml(formatInsulin(actual) || 'No insulin')}</dd>
          </div>
        </dl>
        <div class="lee_lee_diabetes_actions">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="cancel-delete">Cancel</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--danger" data-action="confirm-delete-record">Delete Record</button>
        </div>
      </section>
    `;
    root.querySelector('[data-action="cancel-delete"]')?.focus();
  }

  function getExportRecords() {
    return filterRecordsByDateRange(activeRecords(), exportOptions);
  }

  function renderExport() {
    currentEditor = { mode: 'export' };
    const root = getRoot();
    if (!root) return;
    const exportRecords = getExportRecords();
    const rangeText = formatDateRangeText(exportOptions);
    root.innerHTML = `
      <section class="lee_lee_diabetes_top">
        <p class="lee_lee_diabetes_date">${escapeHtml(formatDate())}</p>
        <h1 class="lee_lee_diabetes_title" id="lee-lee-diabetes-title">Export</h1>
        ${renderPersistenceStatus()}
      </section>
      ${renderTrackerNav('export')}
      <section class="lee_lee_diabetes_editor lee_lee_diabetes_export_controls" aria-label="Export options">
        ${renderFilterControls(exportOptions, 'export')}
        <label class="lee_lee_diabetes_field">
          Report Layout
          <select class="lee_lee_diabetes_select" name="layout" data-filter-scope="export">
            ${REPORT_REGISTRY.map((layout) => `<option value="${escapeHtml(layout.id)}" ${exportOptions.layout === layout.id ? 'selected' : ''}>${escapeHtml(layout.title)}</option>`).join('')}
          </select>
        </label>
        <p class="lee_lee_diabetes_help">${escapeHtml(exportRecords.length)} ${exportRecords.length === 1 ? 'record' : 'records'} from ${escapeHtml(rangeText)}.</p>
        <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary" data-action="print-report" ${exportRecords.length ? '' : 'disabled'}>Print or Save as PDF</button>
        ${exportRecords.length ? '' : '<p class="lee_lee_diabetes_empty" role="status">No records are available for this date range.</p>'}
      </section>
      <section class="lee_lee_diabetes_report_preview" aria-label="Printable report preview">
        ${renderReportPreview(exportRecords, rangeText)}
      </section>
    `;
  }

  function renderReportPreview(exportRecords, rangeText) {
    const report = getReportDefinition(exportOptions.layout);
    const reportData = report.builder(exportRecords);
    return `
      <article class="lee_lee_diabetes_report ${report.printLayout === 'landscape' ? 'lee_lee_diabetes_report--landscape' : ''}">
        ${renderReportHeader(rangeText)}
        ${report.id === 'clinical'
          ? renderClinicalLogReport(reportData)
          : renderDetailedReport(reportData)}
      </article>
    `;
  }

  function getPatientSettings() {
    return trackerData.settings && typeof trackerData.settings === 'object'
      ? trackerData.settings
      : {};
  }

  function renderReportHeader(rangeText) {
    const settings = getPatientSettings();
    const details = [
      settings.patientName ? ['Patient', settings.patientName] : null,
      settings.patientBirthDate ? ['Date of birth', formatShortDateKey(settings.patientBirthDate)] : null,
      settings.clinicName ? ['Clinic', settings.clinicName] : null,
      settings.clinicPhone ? ['Clinic phone', settings.clinicPhone] : null,
      ['Report range', rangeText],
      ['Generated', `${formatDate(new Date())} at ${formatTime(Date.now())}`],
    ].filter(Boolean);
    return `
      <header class="lee_lee_diabetes_report_header">
        <h2>Lee-Lee’s Tracker</h2>
        <dl>
          ${details.map(([label, value]) => `
            <div>
              <dt>${escapeHtml(label)}</dt>
              <dd>${escapeHtml(value)}</dd>
            </div>
          `).join('')}
        </dl>
      </header>
    `;
  }

  function renderClinicalLogReport(reportData) {
    const rows = reportData.groups;
    if (!rows.length) return '';
    return `
      <section class="lee_lee_diabetes_report_section">
        <h3>Clinical Log</h3>
        <table class="lee_lee_diabetes_clinical_table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              ${PRIMARY_TYPES.map((type) => `
                <th scope="col">${escapeHtml(type)} BG</th>
                <th scope="col">${escapeHtml(type)} Insulin</th>
              `).join('')}
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(renderClinicalLogRow).join('')}
          </tbody>
        </table>
      </section>
    `;
  }

  function renderClinicalLogRow(group) {
    const additional = group.additionalRecords.length
      ? `Additional checks: ${group.additionalRecords.map((record) => `${record.type} ${formatTime(getRecordTimestamp(record))} ${formatBloodSugar(record.bloodSugar) || 'No BG'} ${formatInsulin(getRecordActualInsulin(record)) || 'No insulin'}${record.notes ? ` (${record.notes})` : ''}`).join('; ')}`
      : '';
    const notes = [
      ...PRIMARY_TYPES.map((type) => group.primary[type]?.notes || '').filter(Boolean),
      additional,
    ].filter(Boolean).join(' | ');
    return `
      <tr>
        <th scope="row">${escapeHtml(formatShortDateKey(group.dateKey))}</th>
        ${PRIMARY_TYPES.map((type) => {
          const record = group.primary[type];
          return `
            <td>${escapeHtml(record ? formatBloodSugar(record.bloodSugar) || '—' : '—')}</td>
            <td>${escapeHtml(record ? formatInsulin(getRecordActualInsulin(record)) || '—' : '—')}</td>
          `;
        }).join('')}
        <td>${escapeHtml(notes || '—')}</td>
      </tr>
    `;
  }

  function renderDetailedReport(reportData) {
    const groups = reportData.groups;
    if (!groups.length) return '';
    return `
      <section class="lee_lee_diabetes_report_section">
        <h3>Detailed Report</h3>
        ${groups.map((group) => `
          <section class="lee_lee_diabetes_report_day">
            <h4>${escapeHtml(formatDateKey(group.dateKey))}</h4>
            ${renderSummaryGrid(group.summary)}
            <table class="lee_lee_diabetes_detail_table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Type</th>
                  <th scope="col">Blood Sugar</th>
                  <th scope="col">Insulin Given</th>
                  <th scope="col">Suggested</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                ${group.records.map(renderDetailedReportRow).join('')}
              </tbody>
            </table>
          </section>
        `).join('')}
      </section>
    `;
  }

  function renderDetailedReportRow(record) {
    const suggestedParts = [
      record.suggestedTotalUnits == null ? '' : formatInsulin(record.suggestedTotalUnits),
      record.suggestedBaseUnits == null && record.suggestedCorrectionUnits == null
        ? ''
        : `${formatInsulin(record.suggestedBaseUnits)} base + ${formatInsulin(record.suggestedCorrectionUnits)} correction`,
      record.doseCalculationStatus && record.doseCalculationStatus !== 'calculated' && record.doseCalculationStatus !== 'manual'
        ? record.doseCalculationStatus
        : '',
    ].filter(Boolean).join(' · ');
    const planName = record.insulinPlanSnapshot?.name || record.insulinPlanId || '';
    return `
      <tr>
        <td>${escapeHtml(formatTime(getRecordTimestamp(record)))}</td>
        <td>${escapeHtml(record.type)}</td>
        <td>${escapeHtml(formatBloodSugar(record.bloodSugar) || '—')}</td>
        <td>${escapeHtml(formatInsulin(getRecordActualInsulin(record)) || '—')}</td>
        <td>${escapeHtml(suggestedParts || '—')}</td>
        <td>${escapeHtml(planName || '—')}</td>
        <td>${escapeHtml(record.notes || '—')}</td>
      </tr>
    `;
  }

  function renderEditor(options) {
    const root = getRoot();
    if (!root) return;
    const record = options.record || {};
    currentEditor = {
      mode: options.mode,
      id: record.id || null,
      type: record.type || options.type || DEFAULT_ENTRY_TYPE,
      originalRecord: record.id ? { ...record } : null,
      returnTo: options.returnTo || null,
      returnDateKey: options.returnDateKey || null,
    };
    trackerMenuOpen = false;
    const now = new Date();
    const recordTimestamp = record.recordTimestamp != null
      ? getRecordTimestamp(record)
      : now.getTime();
    const eventDate = record.date || getLocalDateKey(new Date(recordTimestamp));
    const eventTime = record.time || getLocalTimeKey(new Date(recordTimestamp));
    const config = getEntryTypeConfig(currentEditor.type);
    root.innerHTML = `
      <form class="lee_lee_diabetes_editor" data-lee-lee-editor>
        <h1 class="lee_lee_diabetes_editor_title" id="lee-lee-diabetes-title">${escapeHtml(currentEditor.id ? 'Edit Entry' : 'Log Entry')}</h1>
        ${renderTypeSelect(currentEditor.type)}
        ${config.fields.includes('bloodSugar') ? `
          <label class="lee_lee_diabetes_field">
            Blood Sugar
            <input class="lee_lee_diabetes_input" name="bloodSugar" type="number" inputmode="numeric" min="0" step="1" autocomplete="off" value="${escapeHtml(record.bloodSugar ?? '')}">
          </label>
        ` : ''}
        <label class="lee_lee_diabetes_field">
          Date
          <input class="lee_lee_diabetes_input" name="date" type="date" required value="${escapeHtml(eventDate)}">
        </label>
        <label class="lee_lee_diabetes_field">
          Time
          <input class="lee_lee_diabetes_input" name="time" type="time" required value="${escapeHtml(eventTime)}">
        </label>
        <div data-dose-helper aria-live="polite"></div>
        ${config.fields.includes('insulinUnits') ? `
          <label class="lee_lee_diabetes_field">
            <span data-insulin-label>${entryTypeUsesMealGuidance(currentEditor.type) ? 'Insulin Actually Given' : 'Insulin'}</span>
            <input class="lee_lee_diabetes_input" name="insulinUnits" type="number" inputmode="decimal" min="0" step="0.5" autocomplete="off" value="${escapeHtml(record.administeredInsulinUnits ?? record.insulinUnits ?? '')}">
          </label>
        ` : ''}
        ${config.fields.includes('notes') ? `
          <label class="lee_lee_diabetes_field">
            Notes
            <textarea class="lee_lee_diabetes_textarea" name="notes" rows="4">${escapeHtml(record.notes || '')}</textarea>
          </label>
        ` : ''}
        <div class="lee_lee_diabetes_actions">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="cancel">Cancel</button>
          <button type="submit" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary" data-save-record>Save</button>
        </div>
      </form>
    `;
    updateEditorState(root.querySelector('[data-lee-lee-editor]'));
    root.querySelector('[name="bloodSugar"]')?.focus();
  }

  function getEditorType(form) {
    const typeInput = form.elements.type;
    return typeInput && EXTRA_TYPES.includes(typeInput.value)
      ? typeInput.value
      : currentEditor?.type || DEFAULT_ENTRY_TYPE;
  }

  function getEditorRecordTimestamp(form) {
    return createLocalTimestamp(form.elements.date?.value, form.elements.time?.value);
  }

  function getEditorDoseResult(form) {
    const type = getEditorType(form);
    const recordTimestamp = getEditorRecordTimestamp(form);
    if (!entryTypeUsesMealGuidance(type)) {
      return {
        status: 'manual',
        baseUnits: null,
        correctionUnits: null,
        suggestedTotalUnits: null,
        matchedRange: null,
        insulinPlanId: null,
        insulinPlanSnapshot: null,
        message: '',
      };
    }
    const insulinPlan = recordTimestamp ? getActiveInsulinPlan(recordTimestamp) : null;
    if (!insulinPlan) {
      return {
        status: 'unavailable',
        baseUnits: null,
        correctionUnits: null,
        suggestedTotalUnits: null,
        matchedRange: null,
        insulinPlanId: null,
        insulinPlanSnapshot: null,
        message: 'No insulin plan is configured for this date.',
      };
    }
    const result = calculateMealInsulinDose({
      bloodSugar: form.elements.bloodSugar?.value,
      entryType: type,
      insulinPlan,
      recordTimestamp,
    });
    return {
      ...result,
      insulinPlanSnapshot: result.insulinPlanId ? clonePlanSnapshot(insulinPlan) : null,
    };
  }

  function renderDoseHelperResult(result) {
    if (result.status === 'calculated') {
      return `
        <section class="lee_lee_diabetes_dose_card" aria-label="Suggested insulin">
          <div>
            <div class="lee_lee_diabetes_dose_label">Suggested dose</div>
            <div class="lee_lee_diabetes_dose_total">${escapeHtml(formatInsulin(result.suggestedTotalUnits))}</div>
            <div class="lee_lee_diabetes_dose_breakdown">${escapeHtml(formatInsulin(result.baseUnits))} base + ${escapeHtml(formatInsulin(result.correctionUnits))} correction</div>
            <div class="lee_lee_diabetes_dose_range">${escapeHtml(formatRange(result.matchedRange))}</div>
          </div>
          <p>${escapeHtml(result.message)}</p>
        </section>
      `;
    }
    if (result.status === 'outside-configured-range') {
      return `
        <section class="lee_lee_diabetes_dose_card lee_lee_diabetes_dose_card--notice" aria-label="Dose guidance unavailable">
          <div class="lee_lee_diabetes_dose_label">${escapeHtml(result.message)}</div>
          <p>Follow Lee-Lee’s clinician-provided high-glucose instructions or contact the diabetes care team.</p>
        </section>
      `;
    }
    if (result.status === 'unsupported-entry-type') {
      return `<p class="lee_lee_diabetes_help">${escapeHtml(result.message)}</p>`;
    }
    return result.message ? `<p class="lee_lee_diabetes_help">${escapeHtml(result.message)}</p>` : '';
  }

  function updateDoseHelper(form) {
    if (!form) return null;
    const type = getEditorType(form);
    const label = form.querySelector('[data-insulin-label]');
    if (label) {
      label.textContent = entryTypeUsesMealGuidance(type) ? 'Insulin Actually Given' : 'Insulin';
    }
    const helper = form.querySelector('[data-dose-helper]');
    const result = getEditorDoseResult(form);
    if (helper) {
      helper.innerHTML = renderDoseHelperResult(result);
    }
    const insulinInput = form.elements.insulinUnits;
    if (
      result.status === 'calculated'
      && insulinInput
      && (insulinInput.value === '' || form.dataset.autofilledInsulin === 'true')
      && form.dataset.userEditedInsulin !== 'true'
      && !currentEditor?.id
    ) {
      insulinInput.value = String(result.suggestedTotalUnits);
      form.dataset.autofilledInsulin = 'true';
    }
    if (
      result.status !== 'calculated'
      && insulinInput
      && form.dataset.autofilledInsulin === 'true'
      && form.dataset.userEditedInsulin !== 'true'
    ) {
      insulinInput.value = '';
      delete form.dataset.autofilledInsulin;
    }
    return result;
  }

  function updateEditorState(form) {
    updateDoseHelper(form);
    updateEditorSaveState(form);
  }

  function updateEditorSaveState(form) {
    if (!form) return;
    const saveButton = form.querySelector('[data-save-record]');
    if (!saveButton) return;
    const hasDate = Boolean(form.elements.date?.value);
    const hasTime = Boolean(form.elements.time?.value);
    saveButton.disabled = !(hasDate && hasTime);
  }

  function renderTypeSelect(selectedType) {
    return `
      <label class="lee_lee_diabetes_field">
        Entry Type
        <select class="lee_lee_diabetes_select" name="type">
          ${ENTRY_TYPE_DEFINITIONS.map(({ type, label }) => `<option value="${escapeHtml(type)}" ${type === selectedType ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
        </select>
      </label>
    `;
  }

  function openPrimaryEditor(type) {
    renderEditor({
      mode: 'primary',
      type,
      record: latestRecordForType(type) || { type },
    });
  }

  function openExtraEditor() {
    renderEditor({
      mode: 'log-entry',
      record: { type: DEFAULT_ENTRY_TYPE },
    });
  }

  function openLogEntryEditor() {
    renderEditor({
      mode: 'log-entry',
      record: { type: DEFAULT_ENTRY_TYPE },
    });
  }

  function upsertRecord(record) {
    setPersistenceStatus('saving');
    const existingRecord = records.find((item) => item.id === record.id) || null;
    updateTrackerData((current) => {
      const nextRecords = [...current.records];
      const index = nextRecords.findIndex((item) => item.id === record.id);
      if (index >= 0) {
        nextRecords[index] = record;
      } else {
        nextRecords.push(record);
      }
      return {
        ...current,
        records: nextRecords,
      };
    });
    syncRepository?.queueUpsert(record, existingRecord);
  }

  function buildRecordFromForm(form) {
    const now = new Date();
    const existing = currentEditor?.id
      ? records.find((record) => record.id === currentEditor.id)
      : null;
    const observedContext = getObservedEntryContext(form);
    const recordTimestamp = observedContext.recordTimestamp;
    if (!recordTimestamp) {
      updateEditorSaveState(form);
      return null;
    }
    const nowTimestamp = now.toISOString();
    const calculatedGuidance = getCalculatedGuidance(form);
    const actualAction = getActualRecordedAction(form);
    return {
      id: existing?.id || createId(),
      date: getLocalDateKey(new Date(recordTimestamp)),
      time: getLocalTimeKey(new Date(recordTimestamp)),
      type: observedContext.type,
      bloodSugar: observedContext.bloodSugar,
      insulinUnits: actualAction.administeredInsulinUnits,
      administeredInsulinUnits: actualAction.administeredInsulinUnits,
      suggestedBaseUnits: calculatedGuidance.status === 'calculated' ? calculatedGuidance.baseUnits : null,
      suggestedCorrectionUnits: calculatedGuidance.status === 'calculated' ? calculatedGuidance.correctionUnits : null,
      suggestedTotalUnits: calculatedGuidance.status === 'calculated' ? calculatedGuidance.suggestedTotalUnits : null,
      insulinPlanId: calculatedGuidance.insulinPlanId || null,
      insulinPlanSnapshot: calculatedGuidance.insulinPlanSnapshot || null,
      doseCalculationStatus: calculatedGuidance.status,
      notes: observedContext.notes,
      recordTimestamp: new Date(recordTimestamp).toISOString(),
      createdAt: existing?.createdAt ?? nowTimestamp,
      updatedAt: nowTimestamp,
      version: existing?.version || 1,
      enteredBy: existing?.enteredBy || syncRepository?.getDeviceIdentity?.() || 'Unknown',
      lastEditedBy: existing ? (syncRepository?.getDeviceIdentity?.() || 'Unknown') : null,
      deletedAt: existing?.deletedAt || null,
      deletedBy: existing?.deletedBy || null,
      source: existing?.source || 'app',
      clientCreatedAt: existing?.clientCreatedAt || existing?.createdAt || nowTimestamp,
    };
  }

  function getObservedEntryContext(form) {
    return {
      type: getEditorType(form),
      recordTimestamp: getEditorRecordTimestamp(form),
      bloodSugar: normalizeBloodSugar(form.elements.bloodSugar?.value),
      notes: sanitizeNotes(form.elements.notes?.value),
    };
  }

  function getCalculatedGuidance(form) {
    return getEditorDoseResult(form);
  }

  function getActualRecordedAction(form) {
    return {
      administeredInsulinUnits: normalizeNumber(form.elements.insulinUnits?.value),
    };
  }

  function renderRecordConfirmation(record) {
    const root = getRoot();
    if (!root) return;
    currentEditor = {
      ...(currentEditor || {}),
      pendingRecord: record,
    };
    const suggested = record.suggestedTotalUnits == null
      ? 'No suggested dose'
      : formatInsulin(record.suggestedTotalUnits);
    const given = formatInsulin(record.administeredInsulinUnits) || 'No insulin entered';
    const differs = record.suggestedTotalUnits != null
      && record.administeredInsulinUnits != null
      && Number(record.suggestedTotalUnits) !== Number(record.administeredInsulinUnits);
    root.innerHTML = `
      <section class="lee_lee_diabetes_editor" aria-labelledby="lee-lee-diabetes-title">
        <h1 class="lee_lee_diabetes_editor_title" id="lee-lee-diabetes-title">Confirm insulin given</h1>
        <dl class="lee_lee_diabetes_confirm_list">
          <div>
            <dt>Blood sugar</dt>
            <dd>${escapeHtml(formatBloodSugar(record.bloodSugar) || 'No blood sugar')}</dd>
          </div>
          <div>
            <dt>Suggested dose</dt>
            <dd>${escapeHtml(suggested)}</dd>
          </div>
          <div>
            <dt>${differs ? 'Recorded as given' : 'Insulin entered as given'}</dt>
            <dd>${escapeHtml(given)}</dd>
          </div>
          <div>
            <dt>Record time</dt>
            <dd>${escapeHtml(formatRecordDateTime(record.recordTimestamp))}</dd>
          </div>
        </dl>
        <p class="lee_lee_diabetes_help">Based on the current clinician-provided insulin plan. Confirm the dose before giving insulin.</p>
        <div class="lee_lee_diabetes_actions">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="back-to-editor">Go Back</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary" data-action="confirm-save">Confirm and Save</button>
        </div>
      </section>
    `;
  }

  function handleSave(form) {
    const record = buildRecordFromForm(form);
    if (!record) return;
    if (MEAL_TYPES.includes(record.type) && record.administeredInsulinUnits != null) {
      renderRecordConfirmation(record);
      return;
    }
    upsertRecord(record);
    renderAfterRecordChange(record);
  }

  function renderAfterRecordChange(record) {
    if (currentEditor?.returnTo === 'history-day') {
      renderHistoryDay(getRecordEventDateKey(record));
      return;
    }
    renderHome();
  }

  function getCurrentPlan() {
    return getActiveInsulinPlan(Date.now()) || insulinPlans
      .slice()
      .sort((a, b) => (getPlanTimestampRange(b).start - getPlanTimestampRange(a).start))[0];
  }

  function getMigrationCandidateRecords() {
    return activeRecords();
  }

  function getLocalOnlyRecordCount() {
    return activeRecords().filter((record) => !['synced', 'waiting', 'offline'].includes(record.syncStatus)).length;
  }

  function shouldShowSharedSyncMigrationPrompt() {
    const metadata = getSharedSyncMigrationMetadata();
    return shouldShowProtectedApp()
      && !metadata.migrationCompleted
      && !metadata.promptDismissed
      && getMigrationCandidateRecords().length > 0;
  }

  function renderMigrationExplainer() {
    return `
      <ul class="lee_lee_diabetes_explainer_list">
        <li>Local records remain on this device.</li>
        <li>A safety backup can be downloaded before anything uploads.</li>
        <li>Duplicate detection prevents the same record from being added twice.</li>
        <li>Existing cloud data is preserved.</li>
        <li>Only missing records are uploaded.</li>
      </ul>
    `;
  }

  function focusPrimaryAction() {
    requestAnimationFrame(() => {
      const root = getRoot();
      root?.querySelector('[data-primary-focus]')?.focus();
    });
  }

  function renderSharedSyncMigrationPrompt() {
    const root = getRoot();
    if (!root) return;
    const count = getMigrationCandidateRecords().length;
    currentEditor = { mode: 'shared-sync-migration-prompt' };
    root.innerHTML = `
      <section class="lee_lee_diabetes_editor" aria-labelledby="lee-lee-diabetes-title" role="dialog" aria-modal="true">
        <h1 class="lee_lee_diabetes_editor_title" id="lee-lee-diabetes-title">We found existing records on this device.</h1>
        <p class="lee_lee_diabetes_help">${escapeHtml(count)} ${count === 1 ? 'record is' : 'records are'} stored locally.</p>
        <p class="lee_lee_diabetes_help">Your shared account is ready. Upload your existing history so it becomes available on all signed-in devices.</p>
        <p class="lee_lee_diabetes_help">Nothing will be removed from this device.</p>
        ${renderMigrationExplainer()}
        <div class="lee_lee_diabetes_backup_actions">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="export-backup" ${storageAvailability.available ? '' : 'disabled'}>Download Safety Backup</button>
        </div>
        <div class="lee_lee_diabetes_actions">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="dismiss-migration-prompt">Not Now</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary" data-action="begin-local-migration" data-started-from="prompt" data-primary-focus>Begin Migration</button>
        </div>
      </section>
    `;
    focusPrimaryAction();
    if (!isOffline && !isAuth && !isFailed && shouldAutomaticallyContinueMigration(session)) {
      scheduleMigrationContinuation(getRetryDelay(Number(session?.retryCount || 1)));
    }
  }

  function renderSharedSettingsMigrationPrompt() {
    const root = getRoot();
    if (!root) return;
    currentEditor = { mode: 'shared-settings-migration-prompt' };
    root.innerHTML = `
      <section class="lee_lee_diabetes_editor" aria-labelledby="lee-lee-diabetes-title" role="dialog" aria-modal="true">
        <h1 class="lee_lee_diabetes_editor_title" id="lee-lee-diabetes-title">Patient and clinic information was found on this device.</h1>
        <p class="lee_lee_diabetes_help">Upload it to the shared account so it appears the same on every signed-in device?</p>
        <p class="lee_lee_diabetes_help">Nothing will be removed from this device.</p>
        <div class="lee_lee_diabetes_actions">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="dismiss-shared-settings-migration">Not Now</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary" data-action="upload-shared-settings" data-primary-focus>Upload Shared Settings</button>
        </div>
      </section>
    `;
    focusPrimaryAction();
  }

  function renderMigrationProgress() {
    const root = getRoot();
    if (!root) return;
    const summary = getMigrationSessionSummary();
    const total = summary.total;
    const completed = summary.processed;
    const percent = summary.percent;
    currentEditor = { mode: 'shared-sync-migration-progress' };
    root.innerHTML = `
      <section class="lee_lee_diabetes_editor" aria-labelledby="lee-lee-diabetes-title" role="dialog" aria-modal="true" aria-busy="true">
        <h1 class="lee_lee_diabetes_editor_title" id="lee-lee-diabetes-title">Uploading existing history...</h1>
        <p class="lee_lee_diabetes_help" aria-live="polite">${escapeHtml(completed)} of ${escapeHtml(total)} complete</p>
        <p class="lee_lee_diabetes_help">${escapeHtml(summary.remaining)} ${summary.remaining === 1 ? 'record' : 'records'} remaining</p>
        <div class="lee_lee_diabetes_progress" role="progressbar" aria-label="Migration progress" aria-valuemin="0" aria-valuemax="${escapeHtml(total)}" aria-valuenow="${escapeHtml(completed)}">
          <span class="lee_lee_diabetes_progress_bar" style="width: ${escapeHtml(percent)}%"></span>
        </div>
        <p class="lee_lee_diabetes_help">Please keep Lee-Lee’s Tracker open. No local data will be removed.</p>
        <div class="lee_lee_diabetes_actions lee_lee_diabetes_actions--single">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary" disabled>Migration Running</button>
        </div>
      </section>
    `;
  }

  function renderMigrationComplete() {
    const root = getRoot();
    if (!root) return;
    currentEditor = { mode: 'shared-sync-migration-complete' };
    const summary = getMigrationSessionSummary();
    const hasConflicts = summary.conflicts > 0;
    root.innerHTML = `
      <section class="lee_lee_diabetes_editor" aria-labelledby="lee-lee-diabetes-title" role="dialog" aria-modal="true">
        <h1 class="lee_lee_diabetes_editor_title" id="lee-lee-diabetes-title">✓ Migration complete</h1>
        <dl class="lee_lee_diabetes_confirm_list">
          <div>
            <dt>Uploaded</dt>
            <dd>${escapeHtml(summary.uploaded)}</dd>
          </div>
          <div>
            <dt>Already existed</dt>
            <dd>${escapeHtml(summary.alreadyExisting)}</dd>
          </div>
          <div>
            <dt>Skipped duplicates</dt>
            <dd>${escapeHtml(summary.duplicates)}</dd>
          </div>
          <div>
            <dt>Needs review</dt>
            <dd>${escapeHtml(summary.conflicts)}</dd>
          </div>
          <div>
            <dt>Failed</dt>
            <dd>${escapeHtml(summary.failed)}</dd>
          </div>
        </dl>
        <p class="lee_lee_diabetes_help">${hasConflicts
          ? 'Some records require review before they can finish syncing.'
          : 'Your history is now available on every device signed into Lee-Lee’s Tracker.'}</p>
        <p class="lee_lee_diabetes_help">Realtime synchronization is active.</p>
        <div class="lee_lee_diabetes_actions ${hasConflicts ? '' : 'lee_lee_diabetes_actions--single'}">
          ${hasConflicts ? '<button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="review-conflicts">Review Conflicts</button>' : ''}
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary" data-action="continue-migration-success" data-primary-focus>Continue</button>
        </div>
      </section>
    `;
    focusPrimaryAction();
  }

  function renderMigrationInterrupted() {
    const root = getRoot();
    if (!root) return;
    const session = getMigrationSession();
    const summary = getMigrationSessionSummary(session);
    const isOffline = session?.lastErrorCategory === 'offline';
    const isAuth = session?.lastErrorCategory === 'authentication';
    const isFailed = session?.status === 'needs-attention';
    const title = isAuth
      ? 'Please sign in again to continue migration.'
      : (isOffline ? 'Migration paused — you’re offline.' : (isFailed ? 'Migration needs attention.' : 'Connection is slow. Retrying automatically…'));
    const actionLabel = isAuth
      ? 'Sign In to Continue'
      : (isOffline ? 'Resume When Online' : (isFailed ? `Retry ${summary.failed || summary.remaining} Records` : 'Retry Now'));
    currentEditor = { mode: 'shared-sync-migration-interrupted' };
    root.innerHTML = `
      <section class="lee_lee_diabetes_editor" aria-labelledby="lee-lee-diabetes-title" role="dialog" aria-modal="true">
        <h1 class="lee_lee_diabetes_editor_title" id="lee-lee-diabetes-title">${escapeHtml(title)}</h1>
        <p class="lee_lee_diabetes_help">${escapeHtml(summary.processed)} of ${escapeHtml(summary.total)} records are safely processed.</p>
        <p class="lee_lee_diabetes_help">${escapeHtml(summary.remaining + summary.failed)} ${summary.remaining + summary.failed === 1 ? 'record remains' : 'records remain'}.</p>
        <p class="lee_lee_diabetes_help">No data was lost. The upload will continue automatically when it can.</p>
        ${session?.lastErrorMessage ? `<p class="lee_lee_diabetes_error">${escapeHtml(session.lastErrorMessage)}</p>` : ''}
        <div class="lee_lee_diabetes_actions">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="settings">Settings</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary" data-action="resume-migration" data-primary-focus>${escapeHtml(actionLabel)}</button>
        </div>
      </section>
    `;
    focusPrimaryAction();
  }

  function renderSharedSyncWelcome() {
    const root = getRoot();
    if (!root) return;
    currentEditor = { mode: 'shared-sync-welcome' };
    root.innerHTML = `
      <section class="lee_lee_diabetes_editor" aria-labelledby="lee-lee-diabetes-title" role="dialog" aria-modal="true">
        <h1 class="lee_lee_diabetes_editor_title" id="lee-lee-diabetes-title">Shared Sync is Ready</h1>
        <p class="lee_lee_diabetes_help">Lee-Lee’s Tracker is now synchronized.</p>
        <p class="lee_lee_diabetes_help">Any new glucose readings or insulin records entered on Rolando’s or Emily’s devices will automatically appear everywhere.</p>
        <p class="lee_lee_diabetes_help">You're all set.</p>
        <div class="lee_lee_diabetes_actions lee_lee_diabetes_actions--single">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary" data-action="continue-shared-sync-welcome" data-primary-focus>Continue</button>
        </div>
      </section>
    `;
    focusPrimaryAction();
  }

  function renderSettings(errorMessage = '') {
    const root = getRoot();
    if (!root) return;
    currentEditor = { mode: 'settings' };
    const plan = getCurrentPlan() || clonePlanSnapshot(DEFAULT_INSULIN_PLAN);
    const friendlySyncStatus = getFriendlySyncStatus(syncStatus);
    const sharedSettingsStatus = getSharedSettingsStatus();
    root.innerHTML = `
      <form class="lee_lee_diabetes_editor" data-plan-editor>
        <h1 class="lee_lee_diabetes_editor_title" id="lee-lee-diabetes-title">Settings</h1>
        ${renderTrackerNav('settings')}
        ${renderPersistenceStatus()}
        <section class="lee_lee_diabetes_settings_section" aria-labelledby="lee-lee-patient-title">
          <h2 class="lee_lee_diabetes_section_title" id="lee-lee-patient-title">Patient & Clinic</h2>
          <p class="lee_lee_diabetes_help">Patient and clinic information syncs across signed-in devices.</p>
          <p class="lee_lee_diabetes_save_status lee_lee_diabetes_save_status--${escapeHtml(sharedSettingsStatus.state)}" aria-live="polite">
            ${escapeHtml(patientSettingsError || patientSettingsMessage || sharedSettingsStatus.message)}
          </p>
          <label class="lee_lee_diabetes_field">
            Patient Name
            <input class="lee_lee_diabetes_input" name="patientName" type="text" maxlength="80" value="${escapeHtml(trackerData.settings?.patientName || '')}">
          </label>
          <label class="lee_lee_diabetes_field">
            Date of Birth
            <input class="lee_lee_diabetes_input" name="patientBirthDate" type="date" value="${escapeHtml(trackerData.settings?.patientBirthDate || '')}">
          </label>
          <label class="lee_lee_diabetes_field">
            Clinic Name
            <input class="lee_lee_diabetes_input" name="clinicName" type="text" maxlength="120" value="${escapeHtml(trackerData.settings?.clinicName || '')}">
          </label>
          <label class="lee_lee_diabetes_field">
            Clinic Phone
            <input class="lee_lee_diabetes_input" name="clinicPhone" type="tel" maxlength="40" value="${escapeHtml(trackerData.settings?.clinicPhone || '')}">
          </label>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="save-patient-settings">Save Patient Info</button>
        </section>
        <section class="lee_lee_diabetes_settings_section" aria-labelledby="lee-lee-history-preferences-title">
          <h2 class="lee_lee_diabetes_section_title" id="lee-lee-history-preferences-title">History Preferences</h2>
          <label class="lee_lee_diabetes_field">
            History Initial Window
            <select class="lee_lee_diabetes_select" name="historyInitialWindow">
              ${HISTORY_WINDOW_OPTIONS.map((option) => {
                const currentValue = trackerData.settings?.historyInitialWindowDays || String(DEFAULT_HISTORY_WINDOW_DAYS);
                return `<option value="${escapeHtml(option.value)}" ${String(currentValue) === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`;
              }).join('')}
            </select>
          </label>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="save-history-preference">Save History Preference</button>
        </section>
        <section class="lee_lee_diabetes_settings_section" aria-labelledby="lee-lee-sync-title">
          <h2 class="lee_lee_diabetes_section_title" id="lee-lee-sync-title">Shared Sync</h2>
          <label class="lee_lee_diabetes_field">
            This device is used by
            <select class="lee_lee_diabetes_select" name="deviceIdentity">
              ${['Rolando', 'Emily', 'Unknown'].map((name) => `<option value="${escapeHtml(name)}" ${syncStatus.deviceIdentity === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
            </select>
          </label>
          <div class="lee_lee_diabetes_plan_meta">
            <span>Status: ${escapeHtml(friendlySyncStatus.message)}</span>
            <span>Pending: ${escapeHtml(syncStatus.pendingCount)}</span>
            <span>Conflicts: ${escapeHtml(syncStatus.conflictCount)}</span>
            <span>Realtime: ${escapeHtml(syncStatus.realtimeStatus)}</span>
            <span>Last successful sync: ${escapeHtml(formatRelativeSyncTime(syncStatus.lastSuccessfulSyncAt))}</span>
          </div>
          <div class="lee_lee_diabetes_backup_actions">
            <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="save-device-identity">Save Device</button>
            <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="sync-now">Sync Now</button>
            <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="review-conflicts" ${syncStatus.conflictCount ? '' : 'disabled'}>Review Conflicts</button>
            <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="sign-out">Sign Out This Device</button>
          </div>
        </section>
        ${renderMigrationSettings()}
        ${renderMigrationDiagnostics()}
        <section class="lee_lee_diabetes_settings_section" aria-labelledby="lee-lee-insulin-plan-title">
          <h2 class="lee_lee_diabetes_section_title" id="lee-lee-insulin-plan-title">Insulin Plan</h2>
          ${errorMessage ? `<p class="lee_lee_diabetes_error">${escapeHtml(errorMessage)}</p>` : ''}
          <label class="lee_lee_diabetes_field">
            Plan Name
            <input class="lee_lee_diabetes_input" name="planName" type="text" maxlength="80" value="${escapeHtml(plan.name)}">
          </label>
          <label class="lee_lee_diabetes_field">
            Effective Date
            <input class="lee_lee_diabetes_input" name="effectiveFrom" type="date" required value="${escapeHtml(plan.effectiveFrom)}">
          </label>
          <label class="lee_lee_diabetes_field">
            Meal Base Dose
            <input class="lee_lee_diabetes_input" name="mealBaseUnits" type="number" inputmode="decimal" min="0" step="0.5" required value="${escapeHtml(plan.mealBaseUnits)}">
          </label>
          <div class="lee_lee_diabetes_plan_meta">
            <span>Supported meals: ${escapeHtml(plan.supportedMealTypes.join(', '))}</span>
            <span>Last updated: ${escapeHtml(formatDate(new Date(plan.updatedAt)))}</span>
          </div>
          <fieldset class="lee_lee_diabetes_ranges">
            <legend>Correction Table</legend>
            ${plan.correctionRanges.map(renderRangeEditorRow).join('')}
          </fieldset>
          <label class="lee_lee_diabetes_field">
            Plan Notes
            <textarea class="lee_lee_diabetes_textarea" name="notes" rows="4">${escapeHtml(plan.notes || '')}</textarea>
          </label>
        </section>
        <section class="lee_lee_diabetes_settings_section" aria-labelledby="lee-lee-backup-title">
          <h2 class="lee_lee_diabetes_section_title" id="lee-lee-backup-title">Local Backup</h2>
          <p class="lee_lee_diabetes_help">JSON backups are for restore. CSV files are for human-readable review and cannot restore the tracker.</p>
          <div class="lee_lee_diabetes_backup_actions">
            <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="export-backup">Export Data Backup</button>
            <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="export-csv">Export CSV</button>
            <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="import-backup">Import Data Backup</button>
          </div>
          <input class="lee_lee_diabetes_backup_input" type="file" accept="application/json,.json" data-backup-import aria-label="Import Lee-Lee’s Tracker data backup">
        </section>
        ${renderRecentlyDeletedSettings()}
        <div class="lee_lee_diabetes_actions">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="cancel">Cancel</button>
          <button type="submit" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary">Review Plan Change</button>
        </div>
      </form>
    `;
  }

  function renderRecentlyDeletedSettings() {
    const deleted = deletedRecords();
    return `
      <section class="lee_lee_diabetes_settings_section" aria-labelledby="lee-lee-deleted-title">
        <h2 class="lee_lee_diabetes_section_title" id="lee-lee-deleted-title">Recently Deleted</h2>
        ${deleted.length
          ? `<div class="lee_lee_diabetes_timeline">${deleted.map((record) => `
            <article class="lee_lee_diabetes_timeline_item lee_lee_diabetes_history_record">
              <div>
                <div class="lee_lee_diabetes_timeline_type">${escapeHtml(record.type)}</div>
                <div class="lee_lee_diabetes_record_details">
                  <p>${escapeHtml(formatRecordDateTime(record.recordTimestamp))}</p>
                  <p>${escapeHtml(formatBloodSugar(record.bloodSugar) || 'No blood sugar')} · ${escapeHtml(formatInsulin(getRecordActualInsulin(record)) || 'No insulin')}</p>
                  <p>Deleted by ${escapeHtml(record.deletedBy || 'Unknown')}</p>
                </div>
              </div>
              <div class="lee_lee_diabetes_record_actions">
                <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="restore-record" data-id="${escapeHtml(record.id)}">Restore</button>
              </div>
            </article>
          `).join('')}</div>`
          : '<p class="lee_lee_diabetes_empty">No deleted records.</p>'}
      </section>
    `;
  }

  function renderMigrationDiagnostics() {
    const session = getMigrationSession();
    if (!session) return '';
    const summary = getMigrationSessionSummary(session);
    const lastProgress = session.lastProgressAt ? formatRelativeSyncTime(session.lastProgressAt) : 'Not yet';
    const retryState = session.status === 'retrying'
      ? `Retry ${Number(session.retryCount || 0)}`
      : (session.status || 'idle');
    return `
      <section class="lee_lee_diabetes_settings_section" aria-labelledby="lee-lee-migration-diagnostics-title">
        <h2 class="lee_lee_diabetes_section_title" id="lee-lee-migration-diagnostics-title">Migration Diagnostics</h2>
        <dl class="lee_lee_diabetes_status_grid">
          <div>
            <dt>Status</dt>
            <dd>${escapeHtml(session.status || 'idle')}</dd>
          </div>
          <div>
            <dt>Migration ID</dt>
            <dd>${escapeHtml(session.migrationId || 'Not available')}</dd>
          </div>
          <div>
            <dt>Original total</dt>
            <dd>${escapeHtml(summary.total)}</dd>
          </div>
          <div>
            <dt>Processed</dt>
            <dd>${escapeHtml(summary.processed)}</dd>
          </div>
          <div>
            <dt>Uploaded</dt>
            <dd>${escapeHtml(summary.uploaded)}</dd>
          </div>
          <div>
            <dt>Already existing</dt>
            <dd>${escapeHtml(summary.alreadyExisting)}</dd>
          </div>
          <div>
            <dt>Skipped duplicates</dt>
            <dd>${escapeHtml(summary.duplicates)}</dd>
          </div>
          <div>
            <dt>Needs review</dt>
            <dd>${escapeHtml(summary.conflicts)}</dd>
          </div>
          <div>
            <dt>Failed</dt>
            <dd>${escapeHtml(summary.failed)}</dd>
          </div>
          <div>
            <dt>Remaining</dt>
            <dd>${escapeHtml(summary.remaining)}</dd>
          </div>
          <div>
            <dt>Last progress</dt>
            <dd>${escapeHtml(lastProgress)}</dd>
          </div>
          <div>
            <dt>Last error</dt>
            <dd>${escapeHtml(session.lastErrorCategory || 'None')}</dd>
          </div>
          <div>
            <dt>Retry state</dt>
            <dd>${escapeHtml(retryState)}</dd>
          </div>
        </dl>
        ${session.lastErrorMessage ? `<p class="lee_lee_diabetes_help">${escapeHtml(session.lastErrorMessage)}</p>` : ''}
      </section>
    `;
  }

  function renderMigrationSettings() {
    const activeCount = activeRecords().length;
    const backupAvailable = storageAvailability.available;
    const metadata = getSharedSyncMigrationMetadata();
    const localOnlyCount = getLocalOnlyRecordCount();
    if (metadata.migrationCompleted && localOnlyCount === 0) {
      const friendlySyncStatus = getFriendlySyncStatus(syncStatus);
      const cloudCount = Math.max(metadata.recordsMigrated, activeCount);
      return `
        <section class="lee_lee_diabetes_settings_section" aria-labelledby="lee-lee-cloud-status-title">
          <h2 class="lee_lee_diabetes_section_title" id="lee-lee-cloud-status-title">Cloud Status</h2>
          <p class="lee_lee_diabetes_save_status lee_lee_diabetes_save_status--${escapeHtml(friendlySyncStatus.state)}">${escapeHtml(friendlySyncStatus.message)}</p>
          <dl class="lee_lee_diabetes_status_grid">
            <div>
              <dt>Records in cloud</dt>
              <dd>${escapeHtml(cloudCount)}</dd>
            </div>
            <div>
              <dt>Realtime</dt>
              <dd>${escapeHtml(syncStatus.realtimeStatus === 'connected' ? 'Connected' : syncStatus.realtimeStatus)}</dd>
            </div>
            <div>
              <dt>Last successful sync</dt>
              <dd>${escapeHtml(formatRelativeSyncTime(syncStatus.lastSuccessfulSyncAt))}</dd>
            </div>
            <div>
              <dt>Device</dt>
              <dd>${escapeHtml(syncStatus.deviceIdentity || 'Unknown')}</dd>
            </div>
          </dl>
          <div class="lee_lee_diabetes_backup_actions">
            <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="sync-now">Sync Now</button>
          </div>
        </section>
      `;
    }
    return `
      <section class="lee_lee_diabetes_settings_section" aria-labelledby="lee-lee-migration-title">
        <h2 class="lee_lee_diabetes_section_title" id="lee-lee-migration-title">Existing Records</h2>
        ${!metadata.migrationCompleted && metadata.promptDismissed
          ? '<div class="lee_lee_diabetes_banner"><span>Existing local records have not yet been uploaded.</span><button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="begin-local-migration" data-started-from="settings">Begin Migration</button></div>'
          : ''}
        <p class="lee_lee_diabetes_help">${escapeHtml(activeCount)} active ${activeCount === 1 ? 'record' : 'records'} are available on this device. Create a safety backup before uploading existing local records to the shared account.</p>
        ${renderMigrationExplainer()}
        <div class="lee_lee_diabetes_backup_actions">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="export-backup" ${backupAvailable ? '' : 'disabled'}>Download Safety Backup</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary" data-action="begin-local-migration" data-started-from="settings" ${activeCount ? '' : 'disabled'}>Begin Migration</button>
        </div>
      </section>
    `;
  }

  function exportCsvData() {
    const csv = syncRepository?.exportCsv
      ? syncRepository.exportCsv(activeRecords())
      : '';
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    const now = new Date();
    const stamp = `${getLocalDateKey(now)}-${getLocalTimeKey(now).replace(':', '')}`;
    link.href = URL.createObjectURL(blob);
    link.download = `lee-lee-tracker-records-${stamp}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async function waitForMigrationQueueProgress(previousPending, previousConflicts) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      syncStatus = syncRepository?.getSyncStatus?.() || syncStatus;
      const nextConflicts = syncRepository?.getConflicts?.().length || 0;
      if (nextConflicts > previousConflicts) return syncStatus;
      if ((syncStatus.pendingCount || 0) <= previousPending) return syncStatus;
      if (syncStatus.state !== 'syncing' && syncStatus.state !== 'waiting') return syncStatus;
      await wait(100);
    }
    return syncStatus;
  }

  async function waitForMigrationOperation(operationId, previousConflicts) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      syncStatus = syncRepository?.getSyncStatus?.() || syncStatus;
      const queuedOperation = syncRepository?.getRecordQueueSnapshot?.().find((operation) => operation.id === operationId);
      const nextConflicts = syncRepository?.getConflicts?.().length || 0;
      if (!queuedOperation || nextConflicts > previousConflicts || syncStatus.state === 'offline') return syncStatus;
      await wait(120);
    }
    return syncStatus;
  }

  function getRetryDelay(retryCount) {
    const jitter = Math.round(Math.random() * 250);
    return Math.min(8000, MIGRATION_RETRY_BASE_MS * (2 ** Math.max(0, retryCount - 1)) + jitter);
  }

  function shouldAutomaticallyContinueMigration(session = getMigrationSession()) {
    if (!session || session.status === 'completed' || session.status === 'needs-attention') return false;
    if (['authentication', 'authorization', 'validation'].includes(session.lastErrorCategory)) return false;
    return getMigrationSessionSummary(session).remaining > 0;
  }

  function scheduleMigrationContinuation(delayMs = 0) {
    if (migrationRetryTimer) clearTimeout(migrationRetryTimer);
    migrationRetryTimer = setTimeout(() => {
      migrationRetryTimer = null;
      if (!shouldShowProtectedApp() || navigator.onLine === false || !shouldAutomaticallyContinueMigration()) return;
      beginLocalMigration(migrationFlow.startedFrom || 'settings');
    }, delayMs);
  }

  function setMigrationPaused(session, classification, status = 'paused') {
    return saveMigrationSession({
      ...session,
      status,
      lastAttemptAt: new Date().toISOString(),
      retryCount: Number(session.retryCount || 0) + 1,
      lastErrorCategory: classification.category,
      lastErrorMessage: classification.userMessage,
    });
  }

  function syncMigrationFlowFromSession(session, startedFrom) {
    const summary = getMigrationSessionSummary(session);
    migrationFlow = {
      state: session?.status || 'idle',
      total: summary.total,
      uploaded: summary.uploaded,
      duplicates: summary.alreadyExisting,
      conflicts: summary.conflicts,
      failed: summary.failed,
      remaining: summary.remaining,
      startedFrom,
      error: session?.lastErrorMessage || '',
    };
  }

  function markAlreadySyncedMigrationItems(session, migrationRecords) {
    let nextSession = session;
    migrationRecords.forEach((record) => {
      const sessionKey = createMigrationSessionKey(record);
      if (!(nextSession.pendingFingerprints || []).includes(sessionKey)) return;
      if (record.syncStatus === 'synced') {
        nextSession = markMigrationOutcome(nextSession, sessionKey, 'already-existing', { status: 'running' });
      }
    });
    return nextSession;
  }

  function finishMigrationSession(session) {
    const completedAt = new Date().toISOString();
    const completedSession = saveMigrationSession({
      ...session,
      status: 'completed',
      completedAt,
      lastAttemptAt: completedAt,
      lastErrorCategory: '',
      lastErrorMessage: '',
    });
    const summary = getMigrationSessionSummary(completedSession);
    saveSharedSyncMigrationMetadata({
      migrationCompleted: true,
      migrationCompletedAt: completedAt,
      migrationVersion: SHARED_SYNC_MIGRATION_VERSION,
      recordsMigrated: summary.processed,
      promptDismissed: true,
    });
    syncMigrationFlowFromSession(completedSession, migrationFlow.startedFrom);
    renderMigrationComplete();
  }

  async function beginLocalMigration(startedFrom = 'settings') {
    if (!syncRepository) return;
    if (!preservePreImportBackup()) {
      migrationFlow = {
        ...migrationFlow,
        state: 'interrupted',
        startedFrom,
        error: 'Migration stopped because a safety backup could not be saved on this device.',
      };
      renderMigrationInterrupted();
      return;
    }
    const identity = syncRepository.getDeviceIdentity?.() || 'Unknown';
    const now = new Date().toISOString();
    const migrationRecords = getMigrationCandidateRecords().map((record) => normalizeRecord({
      ...record,
      enteredBy: record.enteredBy && record.enteredBy !== 'Unknown' ? record.enteredBy : identity,
      source: record.source === 'app' ? 'localStorage_migration' : record.source,
      migrationFingerprint: record.migrationFingerprint || [
        record.recordTimestamp,
        record.type,
        record.bloodSugar ?? '',
        record.insulinUnits ?? '',
        record.notes || '',
      ].join('|'),
      updatedAt: record.updatedAt || now,
    })).filter(Boolean);
    updateTrackerData((current) => ({
      ...current,
      records: current.records.map((record) => migrationRecords.find((item) => item.id === record.id) || record),
    }));

    let session = getMigrationSession();
    const existingSourceKeys = new Set(migrationRecords.map(createMigrationSessionKey));
    const canResume = session
      && session.status !== 'completed'
      && session.migrationVersion === SHARED_SYNC_MIGRATION_VERSION
      && (session.sourceFingerprints || []).some((fingerprint) => existingSourceKeys.has(fingerprint));
    if (!canResume) session = saveMigrationSession(createMigrationSession(migrationRecords));
    session = saveMigrationSession({
      ...session,
      status: 'running',
      lastAttemptAt: now,
      lastErrorCategory: '',
      lastErrorMessage: '',
    });
    session = markAlreadySyncedMigrationItems(session, migrationRecords);
    syncMigrationFlowFromSession(session, startedFrom);

    const startedAt = Date.now();
    renderMigrationProgress();
    const recordsToProcess = getMigrationRecordsForSession(session, migrationRecords);
    for (const record of recordsToProcess) {
      const sessionKey = createMigrationSessionKey(record);
      let processed = false;
      for (let attempt = 1; attempt <= MIGRATION_MAX_RETRIES && !processed; attempt += 1) {
        try {
          syncStatus = syncRepository.getSyncStatus?.() || syncStatus;
          if (navigator.onLine === false || syncStatus.state === 'offline') {
            session = setMigrationPaused(session, classifyMigrationError(new Error('offline')), 'paused');
            syncMigrationFlowFromSession(session, startedFrom);
            renderMigrationInterrupted();
            return;
          }
          const conflictsBefore = syncRepository.getConflicts?.().length || 0;
          const existingOperation = syncRepository?.getRecordQueueSnapshot?.().find((item) => item.recordId === record.id);
          const operation = existingOperation || syncRepository.queueUpsert(record, null);
          await syncRepository.processQueue?.();
          syncStatus = await waitForMigrationOperation(operation.id, conflictsBefore);
          const conflictsAfter = syncRepository.getConflicts?.().length || 0;
          const stillQueued = syncRepository?.getRecordQueueSnapshot?.().some((item) => item.id === operation.id);
          if (conflictsAfter > conflictsBefore || syncRepository?.getConflicts?.().some((conflict) => conflict.recordId === record.id)) {
            session = markMigrationOutcome(session, sessionKey, 'conflict', { status: 'running' });
            processed = true;
          } else if (!stillQueued) {
            session = markMigrationOutcome(session, sessionKey, record.syncStatus === 'synced' ? 'already-existing' : 'uploaded', { status: 'running' });
            processed = true;
          } else if (attempt < MIGRATION_MAX_RETRIES) {
            session = setMigrationPaused(session, classifyMigrationError(new Error(syncStatus.lastError || 'timeout')), 'retrying');
            syncMigrationFlowFromSession(session, startedFrom);
            renderMigrationInterrupted();
            await wait(getRetryDelay(attempt));
          }
        } catch (error) {
          const classification = classifyMigrationError(error);
          if (['authorization', 'validation'].includes(classification.category)) {
            session = markMigrationOutcome(session, sessionKey, 'failed', {
              status: 'needs-attention',
              lastAttemptAt: new Date().toISOString(),
              retryCount: Number(session.retryCount || 0) + 1,
              lastErrorCategory: classification.category,
              lastErrorMessage: classification.userMessage,
            });
            processed = true;
          } else if (attempt < MIGRATION_MAX_RETRIES) {
            session = setMigrationPaused(session, classification, 'retrying');
            syncMigrationFlowFromSession(session, startedFrom);
            renderMigrationInterrupted();
            await wait(getRetryDelay(attempt));
          } else {
            session = setMigrationPaused(session, classification, 'paused');
            syncMigrationFlowFromSession(session, startedFrom);
            renderMigrationInterrupted();
            return;
          }
        }
      }
      if (!processed) {
        const queued = syncRepository?.getRecordQueueSnapshot?.().find((item) => item.recordId === record.id);
        const classification = classifyMigrationError(new Error(queued?.lastErrorCategory || syncStatus.lastError || 'timeout'));
        session = setMigrationPaused(session, classification, 'paused');
        syncMigrationFlowFromSession(session, startedFrom);
        renderMigrationInterrupted();
        return;
      }
      syncMigrationFlowFromSession(session, startedFrom);
      renderMigrationProgress();
    }

    const unresolved = getMigrationSessionSummary(session);
    if (unresolved.failed > 0) {
      session = saveMigrationSession({ ...session, status: 'needs-attention' });
      syncMigrationFlowFromSession(session, startedFrom);
      renderMigrationInterrupted();
      return;
    }
    if (unresolved.remaining > 0) {
      session = setMigrationPaused(session, classifyMigrationError(new Error(syncStatus.lastError || 'timeout')), 'paused');
      syncMigrationFlowFromSession(session, startedFrom);
      renderMigrationInterrupted();
      return;
    }

    syncStatus = syncRepository.getSyncStatus?.() || syncStatus;
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_MIGRATION_PROGRESS_MS) await wait(MIN_MIGRATION_PROGRESS_MS - elapsed);
    finishMigrationSession(session);
  }

  function renderRangeEditorRow(range, index) {
    return `
      <div class="lee_lee_diabetes_range_row">
        <label>
          Minimum glucose
          <input class="lee_lee_diabetes_input" name="rangeMin${index}" type="number" inputmode="numeric" min="0" step="1" value="${escapeHtml(range.minGlucose ?? '')}" placeholder="Below">
        </label>
        <label>
          Maximum glucose
          <input class="lee_lee_diabetes_input" name="rangeMax${index}" type="number" inputmode="numeric" min="0" step="1" value="${escapeHtml(range.maxGlucose ?? '')}">
        </label>
        <label>
          Correction units
          <input class="lee_lee_diabetes_input" name="rangeUnits${index}" type="number" inputmode="decimal" min="0" step="0.5" value="${escapeHtml(range.correctionUnits)}">
        </label>
      </div>
    `;
  }

  function validateCorrectionRanges(ranges) {
    if (!ranges.length) return 'Add at least one correction range.';
    for (let index = 0; index < ranges.length; index += 1) {
      const range = ranges[index];
      if (range.minGlucose != null && range.maxGlucose != null && range.minGlucose > range.maxGlucose) {
        return 'Correction ranges need a minimum that is less than or equal to the maximum.';
      }
      if (index === 0 && range.minGlucose != null) {
        return 'The first correction range should omit the minimum glucose to represent below-threshold readings.';
      }
      if (index > 0) {
        const previous = ranges[index - 1];
        if (previous.maxGlucose == null) {
          return 'Only the final correction range may omit a maximum glucose.';
        }
        if (range.minGlucose == null) {
          return 'Only the first correction range may omit a minimum glucose.';
        }
        if (range.minGlucose <= previous.maxGlucose) {
          return 'Correction ranges cannot overlap.';
        }
        if (range.minGlucose !== previous.maxGlucose + 1) {
          return 'Correction ranges should be ordered without unintended gaps.';
        }
      }
    }
    return '';
  }

  function buildPlanFromSettingsForm(form) {
    const ranges = DEFAULT_INSULIN_PLAN.correctionRanges.map((_, index) => normalizeCorrectionRange({
      minGlucose: form.elements[`rangeMin${index}`]?.value,
      maxGlucose: form.elements[`rangeMax${index}`]?.value,
      correctionUnits: form.elements[`rangeUnits${index}`]?.value,
    }));
    if (ranges.some((range) => !range)) {
      return { error: 'Correction ranges must use valid glucose numbers and nonnegative correction units.' };
    }
    const rangeError = validateCorrectionRanges(ranges);
    if (rangeError) return { error: rangeError };
    const mealBaseUnits = normalizeNumber(form.elements.mealBaseUnits.value);
    if (mealBaseUnits == null) return { error: 'Meal base dose must be a nonnegative number.' };
    const effectiveFrom = form.elements.effectiveFrom.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return { error: 'Effective date is required.' };
    const now = new Date().toISOString();
    return {
      plan: {
        id: createId(),
        name: String(form.elements.planName.value || DEFAULT_INSULIN_PLAN.name).trim().slice(0, 80),
        effectiveFrom,
        effectiveTo: null,
        mealBaseUnits,
        supportedMealTypes: [...MEAL_TYPES],
        correctionRanges: ranges,
        notes: sanitizeNotes(form.elements.notes.value),
        createdAt: now,
        updatedAt: now,
      },
    };
  }

  function renderPlanConfirmation(plan) {
    const root = getRoot();
    if (!root) return;
    currentEditor = {
      mode: 'plan-confirmation',
      pendingPlan: plan,
    };
    root.innerHTML = `
      <section class="lee_lee_diabetes_editor" aria-labelledby="lee-lee-diabetes-title">
        <h1 class="lee_lee_diabetes_editor_title" id="lee-lee-diabetes-title">Confirm insulin plan change</h1>
        <p class="lee_lee_diabetes_help">You are changing the insulin plan used to calculate suggested doses.</p>
        <dl class="lee_lee_diabetes_confirm_list">
          <div>
            <dt>Plan</dt>
            <dd>${escapeHtml(plan.name)}</dd>
          </div>
          <div>
            <dt>Effective date</dt>
            <dd>${escapeHtml(plan.effectiveFrom)}</dd>
          </div>
          <div>
            <dt>Meal base dose</dt>
            <dd>${escapeHtml(formatInsulin(plan.mealBaseUnits))}</dd>
          </div>
        </dl>
        <label class="lee_lee_diabetes_checkline">
          <span>I have verified these instructions with Lee-Lee’s diabetes care team.</span>
          <input type="checkbox" data-plan-confirm-check>
        </label>
        <div class="lee_lee_diabetes_actions">
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--ghost" data-action="settings">Go Back</button>
          <button type="button" class="lee_lee_diabetes_button lee_lee_diabetes_button--primary" data-action="confirm-plan" disabled>Activate Plan</button>
        </div>
      </section>
    `;
  }

  function activatePendingPlan() {
    const pendingPlan = currentEditor?.pendingPlan;
    if (!pendingPlan) return;
    const pendingStart = createDateStartTimestamp(pendingPlan.effectiveFrom);
    setPersistenceStatus('saving');
    updateTrackerData((current) => {
      const nextPlans = current.insulinPlans.map((plan) => {
        const range = getPlanTimestampRange(plan);
        if (pendingStart != null && range.start < pendingStart && range.end > pendingStart) {
          return {
            ...plan,
            effectiveTo: pendingPlan.effectiveFrom,
            updatedAt: new Date().toISOString(),
          };
        }
        return plan;
      });
      nextPlans.push(pendingPlan);
      return {
        ...current,
        insulinPlans: nextPlans,
        activeInsulinPlanId: pendingPlan.id,
      };
    });
    renderSettings();
  }

  function savePatientSettings(form) {
    if (!form) return;
    patientSettingsMessage = 'Saving…';
    patientSettingsError = '';
    const sharedSettings = {
      patientName: String(form.elements.patientName?.value || '').trim().slice(0, 80),
      patientBirthDate: /^\d{4}-\d{2}-\d{2}$/.test(String(form.elements.patientBirthDate?.value || ''))
        ? form.elements.patientBirthDate.value
        : '',
      clinicName: String(form.elements.clinicName?.value || '').trim().slice(0, 120),
      clinicPhone: String(form.elements.clinicPhone?.value || '').trim().slice(0, 40),
      version: syncRepository?.getSharedSettings?.()?.version || null,
    };
    const localSettings = {
      patientName: sharedSettings.patientName,
      patientBirthDate: sharedSettings.patientBirthDate,
      clinicName: sharedSettings.clinicName,
      clinicPhone: sharedSettings.clinicPhone,
    };
    setPersistenceStatus('saving');
    updateTrackerData((current) => ({
      ...current,
      settings: {
        ...(current.settings || {}),
        ...localSettings,
      },
    }));
    if (syncRepository?.saveSharedSettings) {
      syncRepository.saveSharedSettings(sharedSettings);
      patientSettingsMessage = navigator.onLine
        ? 'Patient and clinic information updated on all devices.'
        : 'Offline — waiting to sync.';
    } else {
      patientSettingsMessage = 'Patient and clinic information saved on this device.';
    }
    renderSettings();
  }

  function saveHistoryPreference(form) {
    if (!form) return;
    setPersistenceStatus('saving');
    updateTrackerData((current) => ({
      ...current,
      settings: {
        ...(current.settings || {}),
        historyInitialWindowDays: form.elements.historyInitialWindow?.value || String(DEFAULT_HISTORY_WINDOW_DAYS),
      },
    }));
    resetHistoryVisibleWindow();
    renderSettings();
  }

  function handleCancel() {
    if (currentEditor?.returnTo === 'history-day' && currentEditor.returnDateKey) {
      renderHistoryDay(currentEditor.returnDateKey);
      return;
    }
    renderHome();
  }

  function openRecordEditor(recordId, returnTo = 'history-day') {
    const record = records.find((item) => item.id === recordId);
    if (!record) return;
    const returnDateKey = getRecordEventDateKey(record);
    renderEditor({
      mode: 'edit-entry',
      type: record.type,
      record,
      returnTo,
      returnDateKey,
    });
  }

  function deleteRecord(recordId) {
    const record = records.find((item) => item.id === recordId);
    if (!record) return;
    renderDeleteConfirmation(record);
  }

  function confirmDeleteRecord() {
    const recordId = currentEditor?.pendingDeleteId;
    const returnDateKey = currentEditor?.returnDateKey;
    if (!recordId) return;
    const existingRecord = records.find((record) => record.id === recordId);
    if (!existingRecord) return;
    const now = new Date().toISOString();
    const identity = syncRepository?.getDeviceIdentity?.() || 'Unknown';
    const deletedRecord = normalizeRecord({
      ...existingRecord,
      deletedAt: now,
      deletedBy: identity,
      lastEditedBy: identity,
      updatedAt: now,
    });
    setPersistenceStatus('saving');
    updateTrackerData((current) => ({
      ...current,
      records: current.records.map((record) => (record.id === recordId ? deletedRecord : record)),
    }));
    syncRepository?.queueSoftDelete(deletedRecord);
    if (returnDateKey) {
      renderHistoryDay(returnDateKey);
    } else {
      renderHistory();
    }
  }

  function restoreRecord(recordId) {
    const existingRecord = records.find((record) => record.id === recordId);
    if (!existingRecord) return;
    const now = new Date().toISOString();
    const identity = syncRepository?.getDeviceIdentity?.() || 'Unknown';
    const restoredRecord = normalizeRecord({
      ...existingRecord,
      deletedAt: null,
      deletedBy: null,
      lastEditedBy: identity,
      updatedAt: now,
    });
    setPersistenceStatus('saving');
    updateTrackerData((current) => ({
      ...current,
      records: current.records.map((record) => (record.id === recordId ? restoredRecord : record)),
    }));
    syncRepository?.queueRestore(restoredRecord);
    renderSettings();
  }

  function updateHistoryFilters(form) {
    if (!form) return;
    historyFilters = {
      range: form.elements.range?.value || 'last14',
      type: form.elements.type?.value || 'All',
      startDate: form.elements.startDate?.value || '',
      endDate: form.elements.endDate?.value || '',
    };
    renderHistory();
  }

  function openHistoryFilters() {
    lastFocusedElement = document.activeElement;
    historyDraftFilters = { ...historyFilters };
    historyFilterSheetOpen = true;
    renderHistory();
  }

  function closeHistoryFilters() {
    historyFilterSheetOpen = false;
    renderHistory();
    lastFocusedElement?.focus?.();
    lastFocusedElement = null;
  }

  function updateHistoryDraftFilters(form) {
    if (!form) return;
    historyDraftFilters = {
      range: form.elements.range?.value || 'all',
      type: form.elements.type?.value || 'All',
      startDate: form.elements.startDate?.value || '',
      endDate: form.elements.endDate?.value || '',
    };
    historyFilterSheetOpen = true;
    renderHistory();
  }

  function applyHistoryFilters() {
    historyFilters = { ...historyDraftFilters };
    historyFilterSheetOpen = false;
    resetHistoryVisibleWindow();
    renderHistory();
  }

  function clearHistoryFilters() {
    historyFilters = { range: 'all', type: 'All', startDate: '', endDate: '' };
    historyDraftFilters = { ...historyFilters };
    historyFilterSheetOpen = false;
    resetHistoryVisibleWindow();
    renderHistory();
  }

  function loadOlderHistory() {
    const previousScrollY = window.scrollY;
    const increment = getHistoryInitialWindowDays() || DEFAULT_HISTORY_WINDOW_DAYS;
    historyVisibleDayCount = historyVisibleDayCount == null
      ? null
      : historyVisibleDayCount + increment;
    renderHistory();
    window.scrollTo?.(0, previousScrollY);
  }

  function focusHistorySheet(root) {
    if (!historyFilterSheetOpen) return;
    const sheet = root.querySelector('[data-history-filter-sheet]');
    const firstControl = sheet?.querySelector('select, input, button');
    firstControl?.focus();
  }

  function trapHistorySheetFocus(event) {
    if (!historyFilterSheetOpen || event.key !== 'Tab') return;
    const root = getRoot();
    const sheet = root?.querySelector('[data-history-filter-sheet]');
    if (!sheet) return;
    const controls = [...sheet.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.disabled && element.offsetParent !== null);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function updateExportOptions(root) {
    const filtersForm = root.querySelector('[data-export-filters]');
    const layoutInput = root.querySelector('[name="layout"][data-filter-scope="export"]');
    exportOptions = {
      range: filtersForm?.elements.range?.value || 'last7',
      layout: layoutInput?.value || 'clinical',
      startDate: filtersForm?.elements.startDate?.value || '',
      endDate: filtersForm?.elements.endDate?.value || '',
    };
    renderExport();
  }

  function createSyncRepository() {
    if (!window.LeeLeeTrackerSync?.createRepository) return null;
    return window.LeeLeeTrackerSync.createRepository({
      getDocument: () => trackerData,
      saveDocument: (data, options = {}) => saveTrackerData(data, { keepStatus: true, ...options }),
      normalizeRecord,
      mergeDocuments: mergeTrackerDocuments,
      legacyRecordKeys: LEGACY_RECORD_STORAGE_KEYS,
      getLocalSharedSettings,
      onRemoteChange: (nextData) => {
        trackerData = nextData;
        records = trackerData.records;
        insulinPlans = trackerData.insulinPlans;
        if (!currentEditor || ['history', 'history-day', 'export', 'settings'].includes(currentEditor.mode)) {
          if (currentEditor?.mode === 'history') renderHistory();
          else if (currentEditor?.mode === 'history-day') renderHistoryDay(currentEditor.dateKey);
          else if (currentEditor?.mode === 'export') renderExport();
          else if (currentEditor?.mode === 'settings') renderSettings();
          else renderHome();
        }
      },
      onSharedSettingsChange: (settings) => {
        if (currentEditor?.mode === 'settings') return;
        applySharedSettingsToLocal(settings);
        patientSettingsMessage = '';
        patientSettingsError = '';
        if (!currentEditor || ['history', 'history-day', 'export'].includes(currentEditor.mode)) {
          if (currentEditor?.mode === 'history') renderHistory();
          else if (currentEditor?.mode === 'history-day') renderHistoryDay(currentEditor.dateKey);
          else if (currentEditor?.mode === 'export') renderExport();
          else renderHome();
        }
      },
    });
  }

  function shouldShowProtectedApp() {
    return syncStatus.configured && syncStatus.signedIn && Boolean(syncStatus.deviceIdentity);
  }

  function renderInitialRoute() {
    if (!syncStatus.configured) {
      renderConfigurationNeeded();
      return;
    }
    if (!syncStatus.signedIn) {
      renderSignIn();
      return;
    }
    if (!syncStatus.deviceIdentity) {
      renderDeviceIdentitySetup();
      return;
    }
    if (shouldShowSharedSettingsMigrationPrompt()) {
      renderSharedSettingsMigrationPrompt();
      return;
    }
    const migrationSession = getMigrationSession();
    if (migrationSession?.status && migrationSession.status !== 'completed' && getMigrationSessionSummary(migrationSession).remaining > 0) {
      if (shouldAutomaticallyContinueMigration(migrationSession) && navigator.onLine !== false) {
        syncMigrationFlowFromSession(migrationSession, 'home');
        renderMigrationProgress();
        scheduleMigrationContinuation(250);
        return;
      }
      syncMigrationFlowFromSession(migrationSession, 'home');
      renderMigrationInterrupted();
      return;
    }
    if (shouldShowSharedSyncMigrationPrompt()) {
      renderSharedSyncMigrationPrompt();
      return;
    }
    renderHome();
  }

  function refreshCurrentViewForSync() {
    if (!shouldShowProtectedApp()) {
      renderInitialRoute();
      return;
    }
    if (!currentEditor) return;
    if (currentEditor.mode === 'settings') renderSettings();
    if (currentEditor.mode === 'history') renderHistory();
    if (currentEditor.mode === 'export') renderExport();
  }

  async function init() {
    const root = getRoot();
    if (!root) return;
    syncRepository = createSyncRepository();
    if (syncRepository) {
      syncRepository.subscribe((nextStatus) => {
        syncStatus = nextStatus;
        refreshCurrentViewForSync();
      });
      await syncRepository.initialize();
      syncStatus = syncRepository.getSyncStatus();
    }
    root.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'reset-password') {
        const form = target.closest('[data-auth-form]');
        const email = form?.elements.email?.value || '';
        if (!email) {
          authError = 'Enter the account email first.';
          authMessage = '';
          renderSignIn();
          return;
        }
        authError = '';
        authMessage = 'Sending reset email…';
        renderSignIn();
        syncRepository?.sendPasswordReset?.(email).then((result) => {
          authError = result?.error || '';
          authMessage = result?.ok ? 'Password reset email sent.' : '';
          renderSignIn();
        });
        return;
      }
      if (!shouldShowProtectedApp() && !['reset-password'].includes(action)) return;
      if (action === 'toggle-tracker-nav') {
        trackerMenuOpen = !trackerMenuOpen;
        const active = currentEditor?.mode === 'history' || currentEditor?.mode === 'history-day'
          ? 'history'
          : (['export', 'settings'].includes(currentEditor?.mode) ? currentEditor.mode : 'today');
        if (active === 'history' && currentEditor?.mode === 'history-day') renderHistoryDay(currentEditor.dateKey);
        else if (active === 'history') renderHistory();
        else if (active === 'export') renderExport();
        else if (active === 'settings') renderSettings();
        else renderHome();
        return;
      }
      if (action === 'edit-primary') {
        openPrimaryEditor(target.dataset.type);
      }
      if (action === 'extra' || action === 'log-entry') {
        openExtraEditor();
      }
      if (action === 'today') {
        trackerMenuOpen = false;
        renderHome();
      }
      if (action === 'history') {
        trackerMenuOpen = false;
        resetHistoryVisibleWindow();
        renderHistory();
      }
      if (action === 'export') {
        trackerMenuOpen = false;
        renderExport();
      }
      if (action === 'settings') {
        trackerMenuOpen = false;
        renderSettings();
      }
      if (action === 'cancel') {
        handleCancel();
      }
      if (action === 'back-to-editor') {
        renderEditor({
          mode: currentEditor?.mode || 'extra',
          type: currentEditor?.pendingRecord?.type || currentEditor?.type,
          record: currentEditor?.pendingRecord || currentEditor?.originalRecord || {},
          returnTo: currentEditor?.returnTo || null,
          returnDateKey: currentEditor?.returnDateKey || null,
        });
      }
      if (action === 'confirm-save' && currentEditor?.pendingRecord) {
        upsertRecord(currentEditor.pendingRecord);
        renderAfterRecordChange(currentEditor.pendingRecord);
      }
      if (action === 'confirm-plan') {
        activatePendingPlan();
      }
      if (action === 'retry-save') {
        retrySave();
        syncRepository?.processQueue?.();
      }
      if (action === 'export-backup') {
        exportDataBackup();
      }
      if (action === 'export-csv') {
        exportCsvData();
      }
      if (action === 'import-backup') {
        root.querySelector('[data-backup-import]')?.click();
      }
      if (action === 'confirm-import') {
        confirmImportBackup();
      }
      if (action === 'history-date') {
        renderHistoryDay(target.dataset.date);
      }
      if (action === 'reset-history-filters') {
        clearHistoryFilters();
      }
      if (action === 'edit-record') {
        openRecordEditor(target.dataset.id);
      }
      if (action === 'edit-today-record') {
        openRecordEditor(target.dataset.id, 'today');
      }
      if (action === 'delete-record') {
        deleteRecord(target.dataset.id);
      }
      if (action === 'cancel-delete') {
        renderHistoryDay(currentEditor?.returnDateKey || getLocalDateKey());
      }
      if (action === 'confirm-delete-record') {
        confirmDeleteRecord();
      }
      if (action === 'save-patient-settings') {
        savePatientSettings(target.closest('[data-plan-editor]'));
      }
      if (action === 'save-history-preference') {
        saveHistoryPreference(target.closest('[data-plan-editor]'));
      }
      if (action === 'save-device-identity') {
        const form = target.closest('[data-plan-editor]');
        const value = form?.elements.deviceIdentity?.value || '';
        syncRepository?.setDeviceIdentity?.(value);
        syncStatus = syncRepository?.getSyncStatus?.() || syncStatus;
        renderSettings();
      }
      if (action === 'sync-now') {
        syncRepository?.syncNow?.();
      }
      if (action === 'begin-local-migration') {
        beginLocalMigration(target.dataset.startedFrom || currentEditor?.mode || 'settings');
      }
      if (action === 'resume-migration') {
        beginLocalMigration(migrationFlow.startedFrom || 'settings');
      }
      if (action === 'dismiss-migration-prompt') {
        saveSharedSyncMigrationMetadata({
          promptDismissed: true,
          promptDismissedAt: new Date().toISOString(),
        });
        renderHome();
      }
      if (action === 'dismiss-shared-settings-migration') {
        syncRepository?.setSharedSettingsMigration?.({
          prompted: true,
          dismissedAt: new Date().toISOString(),
        });
        renderInitialRoute();
      }
      if (action === 'upload-shared-settings') {
        syncRepository?.saveSharedSettings?.({
          ...getLocalSharedSettings(),
          version: syncRepository?.getSharedSettings?.()?.version || null,
        });
        syncRepository?.setSharedSettingsMigration?.({
          prompted: true,
          completed: true,
          completedAt: new Date().toISOString(),
        });
        patientSettingsMessage = navigator.onLine
          ? 'Patient and clinic information updated on all devices.'
          : 'Offline — waiting to sync.';
        renderInitialRoute();
      }
      if (action === 'continue-migration-success') {
        const metadata = getSharedSyncMigrationMetadata();
        if (!metadata.welcomeShown) {
          renderSharedSyncWelcome();
        } else if (migrationFlow.startedFrom === 'settings') {
          renderSettings();
        } else {
          renderHome();
        }
      }
      if (action === 'continue-shared-sync-welcome') {
        saveSharedSyncMigrationMetadata({
          welcomeShown: true,
          welcomeShownAt: new Date().toISOString(),
        });
        if (migrationFlow.startedFrom === 'settings') {
          renderSettings();
        } else {
          renderHome();
        }
      }
      if (action === 'review-conflicts') {
        renderConflicts();
      }
      if (action === 'select-all-conflicts') {
        conflictSelection = new Set(syncRepository?.getConflicts?.().map((conflict) => conflict.recordId) || []);
        renderConflicts();
      }
      if (action === 'select-no-conflicts') {
        conflictSelection = new Set();
        renderConflicts();
      }
      if (action === 'bulk-keep-shared') {
        resolveSelectedConflicts('keep-shared');
      }
      if (action === 'bulk-use-local') {
        resolveSelectedConflicts('use-local');
      }
      if (action === 'keep-shared-version') {
        syncRepository?.keepSharedVersion?.(target.dataset.id).then(() => {
          syncStatus = syncRepository.getSyncStatus();
          conflictSelection.delete(target.dataset.id);
          renderConflicts();
        });
      }
      if (action === 'use-local-version') {
        syncRepository?.useLocalVersion?.(target.dataset.id).then(() => {
          syncStatus = syncRepository.getSyncStatus();
          conflictSelection.delete(target.dataset.id);
          renderConflicts();
        });
      }
      if (action === 'restore-record') {
        restoreRecord(target.dataset.id);
      }
      if (action === 'sign-out') {
        syncRepository?.signOut?.().then(() => {
          syncStatus = syncRepository.getSyncStatus();
          renderSignIn();
        });
      }
      if (action === 'print-report') {
        window.print();
      }
      if (action === 'open-history-filters') {
        openHistoryFilters();
      }
      if (action === 'cancel-history-filters') {
        closeHistoryFilters();
      }
      if (action === 'apply-history-filters') {
        applyHistoryFilters();
      }
      if (action === 'clear-history-filters') {
        clearHistoryFilters();
      }
      if (action === 'load-older-history') {
        loadOlderHistory();
      }
    });
    root.addEventListener('submit', (event) => {
      if (!event.target.matches('[data-auth-form], [data-device-identity-form], [data-lee-lee-editor], [data-plan-editor]')) return;
      event.preventDefault();
      if (event.target.matches('[data-auth-form]')) {
        const email = event.target.elements.email.value;
        const password = event.target.elements.password.value;
        authError = '';
        authMessage = 'Signing in…';
        renderSignIn();
        syncRepository?.signIn?.(email, password).then((result) => {
          authMessage = '';
          authError = result?.error || '';
          syncStatus = syncRepository.getSyncStatus();
          renderInitialRoute();
        });
        return;
      }
      if (event.target.matches('[data-device-identity-form]')) {
        const value = event.target.elements.deviceIdentity.value;
        if (!value) {
          renderDeviceIdentitySetup('Choose who normally uses this device.');
          return;
        }
        syncRepository?.setDeviceIdentity?.(value);
        syncStatus = syncRepository?.getSyncStatus?.() || syncStatus;
        renderInitialRoute();
        return;
      }
      if (!shouldShowProtectedApp()) {
        renderInitialRoute();
        return;
      }
      if (event.target.matches('[data-plan-editor]')) {
        const result = buildPlanFromSettingsForm(event.target);
        if (result.error) {
          renderSettings(result.error);
          return;
        }
        renderPlanConfirmation(result.plan);
        return;
      }
      handleSave(event.target);
    });
    root.addEventListener('input', (event) => {
      const form = event.target.closest('[data-lee-lee-editor]');
      if (!form) return;
      if (event.target.name === 'insulinUnits') {
        form.dataset.userEditedInsulin = 'true';
      }
      updateEditorState(form);
    });
    root.addEventListener('change', (event) => {
      if (!shouldShowProtectedApp()) return;
      const confirmCheck = event.target.closest('[data-plan-confirm-check]');
      if (confirmCheck) {
        const confirmButton = root.querySelector('[data-action="confirm-plan"]');
        if (confirmButton) confirmButton.disabled = !confirmCheck.checked;
        return;
      }
      const form = event.target.closest('[data-lee-lee-editor]');
      if (!form) return;
      updateEditorState(form);
    });
    root.addEventListener('change', (event) => {
      if (!shouldShowProtectedApp()) return;
      if (event.target.matches('[data-backup-import]')) {
        handleBackupImport(event.target.files?.[0]);
        event.target.value = '';
      }
      const conflictCheckbox = event.target.closest('[data-conflict-select]');
      if (conflictCheckbox) {
        const id = conflictCheckbox.dataset.conflictSelect;
        if (conflictCheckbox.checked) conflictSelection.add(id);
        else conflictSelection.delete(id);
        renderConflicts();
        return;
      }
      const historyForm = event.target.closest('[data-history-filters]');
      if (historyForm) {
        updateHistoryFilters(historyForm);
      }
      const historyDraftForm = event.target.closest('[data-history-filter-draft]');
      if (historyDraftForm) {
        updateHistoryDraftFilters(historyDraftForm);
      }
      if (event.target.closest('[data-export-filters]') || event.target.matches('[name="layout"][data-filter-scope="export"]')) {
        updateExportOptions(root);
      }
    });
    root.addEventListener('keydown', (event) => {
      if (trackerMenuOpen && event.key === 'Escape') {
        event.preventDefault();
        trackerMenuOpen = false;
        const active = currentEditor?.mode === 'history' || currentEditor?.mode === 'history-day'
          ? 'history'
          : (['export', 'settings'].includes(currentEditor?.mode) ? currentEditor.mode : 'today');
        if (active === 'history' && currentEditor?.mode === 'history-day') renderHistoryDay(currentEditor.dateKey);
        else if (active === 'history') renderHistory();
        else if (active === 'export') renderExport();
        else if (active === 'settings') renderSettings();
        else renderHome();
        return;
      }
      if (historyFilterSheetOpen && event.key === 'Escape') {
        event.preventDefault();
        closeHistoryFilters();
        return;
      }
      trapHistorySheetFocus(event);
    });
    window.addEventListener('storage', handleExternalStorageUpdate);
    window.addEventListener('online', () => {
      if (shouldAutomaticallyContinueMigration()) scheduleMigrationContinuation(250);
    });
    requestPersistentStorage();
    renderInitialRoute();
  }

  window.LeeLeeTrackerStorage = {
    storageKey: TRACKER_STORAGE_KEY,
    schemaVersion: TRACKER_SCHEMA_VERSION,
    loadTrackerData,
    saveTrackerData,
    updateTrackerData,
    mergeTrackerDocuments,
    validateBackupPayload,
    createBackupDocument,
  };

  window.LeeLeeTrackerReports = {
    getRecordEventDateKey,
    getRecordTimestamp,
    getRecordActualInsulin,
    sortRecordsChronologically,
    groupRecordsByLocalDate,
    filterRecordsByDateRange,
    filterRecordsByEntryType,
    calculateDailySummary,
    buildClinicalLog,
    buildDetailedReport,
    formatTime,
    formatBloodSugar,
    formatInsulin,
    getTodaysActivityRecords,
    getVisibleHistoryGroups,
    getHistoryFilterCount,
    getHistoryVisibleSummary,
    getDailySummaryCacheSize,
    buildClinicalReport,
    buildDetailedReportData,
    formatRelativeSyncTime,
    getFriendlySyncStatus,
    getMigrationSessionSummary,
    reportRegistry: REPORT_REGISTRY.map(({ id, title, description, printLayout }) => ({ id, title, description, printLayout })),
  };

  document.addEventListener('DOMContentLoaded', init);
})();
