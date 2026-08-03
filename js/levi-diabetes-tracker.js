(() => {
  const TRACKER_STORAGE_KEY = 'lando-world:lee-lees-tracker:v1';
  const TRACKER_SCHEMA_VERSION = 1;
  const PRE_IMPORT_BACKUP_PREFIX = `${TRACKER_STORAGE_KEY}:pre-import-backup:`;
  const LEGACY_RECORD_STORAGE_KEYS = [
    'levi_diabetes_records_v1',
    'lee-lees-tracker',
    'leeLeesTracker',
    'levi-diabetes-tracker',
    'diabetes-tracker',
    'tracker-records',
    'glucose-records',
  ];
  const LEGACY_PLAN_STORAGE_KEYS = [
    'levi_diabetes_insulin_plans_v1',
  ];
  const PRIMARY_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Bedtime', '2 AM'];
  const EXTRA_TYPES = [...PRIMARY_TYPES, 'Correction', 'Snack', 'Exercise', 'Other'];
  const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner'];
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
  let lastFocusedElement = null;
  let exportOptions = {
    range: 'last7',
    layout: 'clinical',
    startDate: '',
    endDate: '',
  };
  let currentEditor = null;

  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function getRoot() {
    return document.getElementById('levi-diabetes-root');
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

  function renderPersistenceStatus() {
    const retry = persistenceStatus === 'failed'
      ? '<button type="button" class="levi_diabetes_status_retry" data-action="retry-save">Retry</button>'
      : '';
    return `
      <p class="levi_diabetes_save_status levi_diabetes_save_status--${escapeHtml(persistenceStatus)}" aria-live="polite">
        ${escapeHtml(persistenceMessage)}
        ${retry}
      </p>
    `;
  }

  function createBackupDocument() {
    return {
      appIdentifier: 'lando-world:lee-lees-tracker',
      exportedAt: new Date().toISOString(),
      ...normalizeTrackerDataDocument(trackerData),
    };
  }

  function exportDataBackup() {
    const backup = createBackupDocument();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const today = getLocalDateKey();
    link.href = URL.createObjectURL(blob);
    link.download = `lee-lees-tracker-backup-${today}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
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
      <section class="levi_diabetes_editor" aria-labelledby="levi-diabetes-title">
        <h1 class="levi_diabetes_editor_title" id="levi-diabetes-title">Import Data Backup</h1>
        <p class="levi_diabetes_help">The backup will be merged with data already on this device. Matching records will not be duplicated.</p>
        <dl class="levi_diabetes_confirm_list">
          <div>
            <dt>Records found</dt>
            <dd>${escapeHtml(importData.records.length)}</dd>
          </div>
          <div>
            <dt>Insulin plans found</dt>
            <dd>${escapeHtml(importData.insulinPlans.length)}</dd>
          </div>
        </dl>
        <div class="levi_diabetes_actions">
          <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost" data-action="settings">Cancel</button>
          <button type="button" class="levi_diabetes_button levi_diabetes_button--primary" data-action="confirm-import">Import Backup</button>
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

  window.LeeLeesTrackerDoseHelper = {
    calculateMealInsulinDose,
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

  function getHistoryFilterSummary(filters) {
    const rangeLabel = DATE_RANGE_OPTIONS.find((option) => option.value === filters.range)?.label || 'All Records';
    const typeLabel = filters.type === 'All' ? 'All Entries' : filters.type;
    return `${rangeLabel} · ${typeLabel}`;
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
    const today = getLocalDateKey();
    return records
      .filter((record) => getRecordEventDateKey(record) === today)
      .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
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
      ? `<div class="levi_diabetes_card_values">${values.map((value) => `<span class="levi_diabetes_pill">${escapeHtml(value)}</span>`).join('')}</div>`
      : '';
  }

  function renderTrackerNav(active) {
    const items = [
      ['today', 'Today'],
      ['history', 'History'],
      ['export', 'Export'],
      ['settings', 'Settings'],
    ];
    return `
      <nav class="levi_diabetes_nav" aria-label="Lee-Lee’s Tracker sections">
        ${items.map(([action, label]) => `
          <button
            type="button"
            class="levi_diabetes_nav_button ${active === action ? 'is-active' : ''}"
            data-action="${escapeHtml(action)}"
            aria-current="${active === action ? 'page' : 'false'}"
          >${escapeHtml(label)}</button>
        `).join('')}
      </nav>
    `;
  }

  function renderHome() {
    currentEditor = null;
    const root = getRoot();
    if (!root) return;
    const timeline = todaysRecords();
    root.innerHTML = `
      <section class="levi_diabetes_top">
        <p class="levi_diabetes_date">${escapeHtml(formatDate())}</p>
        <h1 class="levi_diabetes_title" id="levi-diabetes-title">Lee-Lee’s Tracker</h1>
        ${renderPersistenceStatus()}
      </section>
      ${renderTrackerNav('today')}
      <section class="levi_diabetes_cards" aria-label="Primary events">
        ${PRIMARY_TYPES.map(renderPrimaryCard).join('')}
      </section>
      <button type="button" class="levi_diabetes_button levi_diabetes_button--primary levi_diabetes_extra" data-action="extra">+ Extra Check</button>
      <section aria-labelledby="levi-diabetes-timeline-title">
        <h2 class="levi_diabetes_section_title" id="levi-diabetes-timeline-title">Today</h2>
        ${timeline.length ? `<div class="levi_diabetes_timeline">${timeline.map(renderTimelineItem).join('')}</div>` : '<p class="levi_diabetes_empty">No readings recorded today.</p>'}
      </section>
    `;
  }

  function renderPrimaryCard(type) {
    const record = latestRecordForType(type);
    const isComplete = Boolean(record);
    return `
      <button type="button" class="levi_diabetes_card ${isComplete ? 'is-complete' : ''}" data-action="edit-primary" data-type="${escapeHtml(type)}">
        <span>
          <span class="levi_diabetes_card_title">${escapeHtml(type)}</span>
          <span class="levi_diabetes_card_status">${isComplete ? '✓ Completed' : '○ Not recorded'}</span>
          ${renderValuePills(record)}
        </span>
        <span class="levi_diabetes_card_icon" aria-hidden="true">${isComplete ? '✓' : '+'}</span>
      </button>
    `;
  }

  function renderTimelineItem(record) {
    const notes = record.notes
      ? `<div class="levi_diabetes_timeline_notes">${escapeHtml(record.notes)}</div>`
      : '';
    const doseSummary = getMealDoseSummary(record)
      ? `<div class="levi_diabetes_timeline_notes">${escapeHtml(getMealDoseSummary(record))}</div>`
      : '';
    return `
      <article class="levi_diabetes_timeline_item">
        <div>
          <div class="levi_diabetes_timeline_type">${escapeHtml(record.type)}</div>
          <div class="levi_diabetes_timeline_values">${escapeHtml(formatBloodSugar(record.bloodSugar) || 'No blood sugar')} · ${escapeHtml(formatInsulin(record.insulinUnits) || 'No insulin')}</div>
          ${doseSummary}
          ${notes}
        </div>
        <time class="levi_diabetes_timeline_time" datetime="${escapeHtml(new Date(getRecordTimestamp(record)).toISOString())}">${escapeHtml(formatTime(getRecordTimestamp(record)))}</time>
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
        <label class="levi_diabetes_field">
          Entry Type
          <select class="levi_diabetes_select" name="type" data-filter-scope="${prefix}">
            ${['All', ...EXTRA_TYPES].map((type) => `<option value="${escapeHtml(type)}" ${filters.type === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
          </select>
        </label>
      `
      : '';
    return `
      <form class="levi_diabetes_filters" data-${prefix}-filters>
        <label class="levi_diabetes_field">
          Date Range
          <select class="levi_diabetes_select" name="range" data-filter-scope="${prefix}">
            ${dateOptions}
          </select>
        </label>
        ${typeControl}
        <label class="levi_diabetes_field ${filters.range === 'custom' ? '' : 'is-hidden'}" data-custom-range-field="${prefix}">
          Start Date
          <input class="levi_diabetes_input" name="startDate" type="date" value="${escapeHtml(filters.startDate || '')}" data-filter-scope="${prefix}">
        </label>
        <label class="levi_diabetes_field ${filters.range === 'custom' ? '' : 'is-hidden'}" data-custom-range-field="${prefix}">
          End Date
          <input class="levi_diabetes_input" name="endDate" type="date" value="${escapeHtml(filters.endDate || '')}" data-filter-scope="${prefix}">
        </label>
      </form>
    `;
  }

  function renderHistoryFilterTrigger() {
    const count = getHistoryFilterCount(historyFilters);
    return `
      <div class="levi_diabetes_history_filter_bar">
        <p class="levi_diabetes_filter_summary">${escapeHtml(getHistoryFilterSummary(historyFilters))}</p>
        <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost levi_diabetes_filter_button" data-action="open-history-filters">
          Filters${count ? ` <span class="levi_diabetes_filter_badge">${escapeHtml(count)}</span>` : ''}
        </button>
      </div>
    `;
  }

  function renderHistoryFilterSheet() {
    if (!historyFilterSheetOpen) return '';
    const filters = historyDraftFilters;
    return `
      <div class="levi_diabetes_sheet_backdrop" data-action="cancel-history-filters"></div>
      <section class="levi_diabetes_sheet" role="dialog" aria-modal="true" aria-labelledby="levi-history-filter-title" data-history-filter-sheet>
        <h2 class="levi_diabetes_editor_title" id="levi-history-filter-title">History Filters</h2>
        <form class="levi_diabetes_filters" data-history-filter-draft>
          <label class="levi_diabetes_field">
            Date Range
            <select class="levi_diabetes_select" name="range">
              ${DATE_RANGE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${filters.range === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
            </select>
          </label>
          <label class="levi_diabetes_field">
            Entry Type
            <select class="levi_diabetes_select" name="type">
              ${['All', ...EXTRA_TYPES].map((type) => `<option value="${escapeHtml(type)}" ${filters.type === type ? 'selected' : ''}>${escapeHtml(type === 'All' ? 'All Entry Types' : type)}</option>`).join('')}
            </select>
          </label>
          <label class="levi_diabetes_field ${filters.range === 'custom' ? '' : 'is-hidden'}" data-custom-range-field="history-draft">
            Start Date
            <input class="levi_diabetes_input" name="startDate" type="date" value="${escapeHtml(filters.startDate || '')}">
          </label>
          <label class="levi_diabetes_field ${filters.range === 'custom' ? '' : 'is-hidden'}" data-custom-range-field="history-draft">
            End Date
            <input class="levi_diabetes_input" name="endDate" type="date" value="${escapeHtml(filters.endDate || '')}">
          </label>
        </form>
        <div class="levi_diabetes_actions">
          <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost" data-action="cancel-history-filters">Cancel</button>
          <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost" data-action="clear-history-filters">Clear Filters</button>
          <button type="button" class="levi_diabetes_button levi_diabetes_button--primary" data-action="apply-history-filters">Apply</button>
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
      <dl class="levi_diabetes_summary_grid">
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
    const filtered = getFilteredRecords(records, historyFilters);
    const groups = groupRecordsByLocalDate(filtered);
    const visibleGroups = getVisibleHistoryGroups(groups, historyVisibleDayCount);
    const hasOlderGroups = visibleGroups.length < groups.length;
    const emptyMessage = records.length
      ? `
        <p class="levi_diabetes_empty" role="status">No records match these filters.</p>
        <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost levi_diabetes_extra" data-action="reset-history-filters">Reset Filters</button>
      `
      : `
        <p class="levi_diabetes_empty" role="status">No records yet.</p>
        <p class="levi_diabetes_help">Saved blood-sugar and insulin entries will appear here.</p>
      `;
    root.innerHTML = `
      <section class="levi_diabetes_top">
        <p class="levi_diabetes_date">${escapeHtml(formatDate())}</p>
        <h1 class="levi_diabetes_title" id="levi-diabetes-title">History</h1>
        ${renderPersistenceStatus()}
      </section>
      ${renderTrackerNav('history')}
      ${renderHistoryFilterTrigger()}
      <section class="levi_diabetes_history_list" aria-label="History dates">
        ${visibleGroups.length ? visibleGroups.map(renderHistoryDateCard).join('') : emptyMessage}
      </section>
      ${hasOlderGroups ? `<button type="button" class="levi_diabetes_button levi_diabetes_button--ghost levi_diabetes_extra" data-action="load-older-history">Load Older Records</button>` : ''}
      ${renderHistoryFilterSheet()}
    `;
    focusHistorySheet(root);
  }

  function renderHistoryDateCard(group) {
    const summary = calculateDailySummary(group.records);
    const types = [...new Set(group.records.map((record) => record.type))].join(' · ');
    return `
      <button type="button" class="levi_diabetes_history_date" data-action="history-date" data-date="${escapeHtml(group.dateKey)}">
        <span>
          <span class="levi_diabetes_card_title">${escapeHtml(formatDateKey(group.dateKey))}</span>
          <span class="levi_diabetes_timeline_values">${escapeHtml(summary.entryCount)} ${summary.entryCount === 1 ? 'entry' : 'entries'} · Average: ${escapeHtml(formatSummaryValue(summary.averageBloodSugar, formatBloodSugar))} · Total insulin: ${escapeHtml(formatSummaryValue(summary.totalInsulin, formatInsulin))}</span>
          <span class="levi_diabetes_timeline_notes">${escapeHtml(types)}</span>
        </span>
        <span class="levi_diabetes_card_icon" aria-hidden="true">›</span>
      </button>
    `;
  }

  function renderHistoryDay(dateKey) {
    const root = getRoot();
    if (!root) return;
    const dayRecords = sortRecordsChronologically(records.filter((record) => getRecordEventDateKey(record) === dateKey));
    const summary = calculateDailySummary(dayRecords);
    currentEditor = {
      mode: 'history-day',
      dateKey,
    };
    root.innerHTML = `
      <section class="levi_diabetes_top">
        <p class="levi_diabetes_date">History</p>
        <h1 class="levi_diabetes_title" id="levi-diabetes-title">${escapeHtml(formatDateKey(dateKey))}</h1>
        ${renderPersistenceStatus()}
      </section>
      ${renderTrackerNav('history')}
      <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost levi_diabetes_extra" data-action="history">← All Dates</button>
      ${renderSummaryGrid(summary)}
      <section class="levi_diabetes_timeline" aria-label="Records for ${escapeHtml(formatDateKey(dateKey))}">
        ${dayRecords.length ? dayRecords.map(renderHistoryRecord).join('') : '<p class="levi_diabetes_empty" role="status">No records match these filters.</p>'}
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
      <article class="levi_diabetes_timeline_item levi_diabetes_history_record">
        <div>
          <div class="levi_diabetes_timeline_type">${escapeHtml(record.type)}</div>
          <time class="levi_diabetes_timeline_time" datetime="${escapeHtml(new Date(getRecordTimestamp(record)).toISOString())}">${escapeHtml(formatTime(getRecordTimestamp(record)))}</time>
          <div class="levi_diabetes_record_details">
            <p><strong>Blood sugar:</strong> ${escapeHtml(formatBloodSugar(record.bloodSugar) || 'No blood sugar')}</p>
            <p><strong>Insulin given:</strong> ${escapeHtml(formatInsulin(actual) || 'No insulin')}</p>
            ${suggested ? `<p><strong>Suggested:</strong> ${escapeHtml(suggested)}${differs ? ' · differs from actual' : ''}</p>` : ''}
            ${breakdown ? `<p>${escapeHtml(breakdown)}</p>` : ''}
            ${notes}
          </div>
        </div>
        <div class="levi_diabetes_record_actions">
          <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost" data-action="edit-record" data-id="${escapeHtml(record.id)}">Edit</button>
          <button type="button" class="levi_diabetes_button levi_diabetes_button--danger" data-action="delete-record" data-id="${escapeHtml(record.id)}">Delete</button>
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
      <section class="levi_diabetes_editor" aria-labelledby="levi-diabetes-title" role="dialog" aria-modal="true">
        <h1 class="levi_diabetes_editor_title" id="levi-diabetes-title">Delete this record?</h1>
        <dl class="levi_diabetes_confirm_list">
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
        <div class="levi_diabetes_actions">
          <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost" data-action="cancel-delete">Cancel</button>
          <button type="button" class="levi_diabetes_button levi_diabetes_button--danger" data-action="confirm-delete-record">Delete Record</button>
        </div>
      </section>
    `;
    root.querySelector('[data-action="cancel-delete"]')?.focus();
  }

  function getExportRecords() {
    return filterRecordsByDateRange(records, exportOptions);
  }

  function renderExport() {
    currentEditor = { mode: 'export' };
    const root = getRoot();
    if (!root) return;
    const exportRecords = getExportRecords();
    const rangeText = formatDateRangeText(exportOptions);
    root.innerHTML = `
      <section class="levi_diabetes_top">
        <p class="levi_diabetes_date">${escapeHtml(formatDate())}</p>
        <h1 class="levi_diabetes_title" id="levi-diabetes-title">Export</h1>
        ${renderPersistenceStatus()}
      </section>
      ${renderTrackerNav('export')}
      <section class="levi_diabetes_editor levi_diabetes_export_controls" aria-label="Export options">
        ${renderFilterControls(exportOptions, 'export')}
        <label class="levi_diabetes_field">
          Report Layout
          <select class="levi_diabetes_select" name="layout" data-filter-scope="export">
            ${REPORT_REGISTRY.map((layout) => `<option value="${escapeHtml(layout.id)}" ${exportOptions.layout === layout.id ? 'selected' : ''}>${escapeHtml(layout.title)}</option>`).join('')}
          </select>
        </label>
        <p class="levi_diabetes_help">${escapeHtml(exportRecords.length)} ${exportRecords.length === 1 ? 'record' : 'records'} from ${escapeHtml(rangeText)}.</p>
        <button type="button" class="levi_diabetes_button levi_diabetes_button--primary" data-action="print-report" ${exportRecords.length ? '' : 'disabled'}>Print or Save as PDF</button>
        ${exportRecords.length ? '' : '<p class="levi_diabetes_empty" role="status">No records are available for this date range.</p>'}
      </section>
      <section class="levi_diabetes_report_preview" aria-label="Printable report preview">
        ${renderReportPreview(exportRecords, rangeText)}
      </section>
    `;
  }

  function renderReportPreview(exportRecords, rangeText) {
    const report = getReportDefinition(exportOptions.layout);
    const reportData = report.builder(exportRecords);
    return `
      <article class="levi_diabetes_report ${report.printLayout === 'landscape' ? 'levi_diabetes_report--landscape' : ''}">
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
      <header class="levi_diabetes_report_header">
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
      <section class="levi_diabetes_report_section">
        <h3>Clinical Log</h3>
        <table class="levi_diabetes_clinical_table">
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
      <section class="levi_diabetes_report_section">
        <h3>Detailed Report</h3>
        ${groups.map((group) => `
          <section class="levi_diabetes_report_day">
            <h4>${escapeHtml(formatDateKey(group.dateKey))}</h4>
            ${renderSummaryGrid(group.summary)}
            <table class="levi_diabetes_detail_table">
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
    const isExtra = options.mode === 'extra';
    currentEditor = {
      mode: options.mode,
      id: record.id || null,
      type: record.type || options.type || 'Correction',
      originalRecord: record.id ? { ...record } : null,
      returnTo: options.returnTo || null,
      returnDateKey: options.returnDateKey || null,
    };
    const now = new Date();
    const recordTimestamp = record.recordTimestamp != null
      ? getRecordTimestamp(record)
      : now.getTime();
    const eventDate = record.date || getLocalDateKey(new Date(recordTimestamp));
    const eventTime = record.time || getLocalTimeKey(new Date(recordTimestamp));
    root.innerHTML = `
      <form class="levi_diabetes_editor" data-levi-editor>
        <h1 class="levi_diabetes_editor_title" id="levi-diabetes-title">${escapeHtml(isExtra ? 'Extra Check' : currentEditor.type)}</h1>
        ${isExtra ? renderTypeSelect(currentEditor.type) : ''}
        <label class="levi_diabetes_field">
          Blood Sugar
          <input class="levi_diabetes_input" name="bloodSugar" type="number" inputmode="numeric" min="0" step="1" autocomplete="off" value="${escapeHtml(record.bloodSugar ?? '')}">
        </label>
        <label class="levi_diabetes_field">
          Date
          <input class="levi_diabetes_input" name="date" type="date" required value="${escapeHtml(eventDate)}">
        </label>
        <label class="levi_diabetes_field">
          Time
          <input class="levi_diabetes_input" name="time" type="time" required value="${escapeHtml(eventTime)}">
        </label>
        <div data-dose-helper aria-live="polite"></div>
        <label class="levi_diabetes_field">
          <span data-insulin-label>${MEAL_TYPES.includes(currentEditor.type) ? 'Insulin Actually Given' : 'Insulin'}</span>
          <input class="levi_diabetes_input" name="insulinUnits" type="number" inputmode="decimal" min="0" step="0.5" autocomplete="off" value="${escapeHtml(record.administeredInsulinUnits ?? record.insulinUnits ?? '')}">
        </label>
        <label class="levi_diabetes_field">
          Notes
          <textarea class="levi_diabetes_textarea" name="notes" rows="4">${escapeHtml(record.notes || '')}</textarea>
        </label>
        <div class="levi_diabetes_actions">
          <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost" data-action="cancel">Cancel</button>
          <button type="submit" class="levi_diabetes_button levi_diabetes_button--primary" data-save-record>Save</button>
        </div>
      </form>
    `;
    updateEditorState(root.querySelector('[data-levi-editor]'));
    root.querySelector('[name="bloodSugar"]')?.focus();
  }

  function getEditorType(form) {
    const typeInput = form.elements.type;
    return typeInput && EXTRA_TYPES.includes(typeInput.value)
      ? typeInput.value
      : currentEditor?.type || 'Other';
  }

  function getEditorRecordTimestamp(form) {
    return createLocalTimestamp(form.elements.date?.value, form.elements.time?.value);
  }

  function getEditorDoseResult(form) {
    const type = getEditorType(form);
    const recordTimestamp = getEditorRecordTimestamp(form);
    const insulinPlan = recordTimestamp ? getActiveInsulinPlan(recordTimestamp) : null;
    if (MEAL_TYPES.includes(type) && !insulinPlan) {
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
        <section class="levi_diabetes_dose_card" aria-label="Suggested insulin">
          <div>
            <div class="levi_diabetes_dose_label">Suggested dose</div>
            <div class="levi_diabetes_dose_total">${escapeHtml(formatInsulin(result.suggestedTotalUnits))}</div>
            <div class="levi_diabetes_dose_breakdown">${escapeHtml(formatInsulin(result.baseUnits))} base + ${escapeHtml(formatInsulin(result.correctionUnits))} correction</div>
            <div class="levi_diabetes_dose_range">${escapeHtml(formatRange(result.matchedRange))}</div>
          </div>
          <p>${escapeHtml(result.message)}</p>
        </section>
      `;
    }
    if (result.status === 'outside-configured-range') {
      return `
        <section class="levi_diabetes_dose_card levi_diabetes_dose_card--notice" aria-label="Dose guidance unavailable">
          <div class="levi_diabetes_dose_label">${escapeHtml(result.message)}</div>
          <p>Follow Levi’s clinician-provided high-glucose instructions or contact the diabetes care team.</p>
        </section>
      `;
    }
    if (result.status === 'unsupported-entry-type') {
      return `<p class="levi_diabetes_help">${escapeHtml(result.message)}</p>`;
    }
    return result.message ? `<p class="levi_diabetes_help">${escapeHtml(result.message)}</p>` : '';
  }

  function updateDoseHelper(form) {
    if (!form) return null;
    const type = getEditorType(form);
    const label = form.querySelector('[data-insulin-label]');
    if (label) {
      label.textContent = MEAL_TYPES.includes(type) ? 'Insulin Actually Given' : 'Insulin';
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
      <label class="levi_diabetes_field">
        Type
        <select class="levi_diabetes_select" name="type">
          ${EXTRA_TYPES.map((type) => `<option value="${escapeHtml(type)}" ${type === selectedType ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
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
      mode: 'extra',
      record: { type: 'Correction' },
    });
  }

  function upsertRecord(record) {
    setPersistenceStatus('saving');
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
  }

  function buildRecordFromForm(form) {
    const now = new Date();
    const existing = currentEditor?.id
      ? records.find((record) => record.id === currentEditor.id)
      : null;
    const eventDate = form.elements.date.value;
    const eventTime = form.elements.time.value;
    const recordTimestamp = createLocalTimestamp(eventDate, eventTime);
    if (!recordTimestamp) {
      updateEditorSaveState(form);
      return null;
    }
    const type = getEditorType(form);
    const nowTimestamp = now.toISOString();
    const doseResult = getEditorDoseResult(form);
    const administeredInsulinUnits = normalizeNumber(form.elements.insulinUnits.value);
    return {
      id: existing?.id || createId(),
      date: getLocalDateKey(new Date(recordTimestamp)),
      time: getLocalTimeKey(new Date(recordTimestamp)),
      type,
      bloodSugar: normalizeBloodSugar(form.elements.bloodSugar.value),
      insulinUnits: administeredInsulinUnits,
      administeredInsulinUnits,
      suggestedBaseUnits: doseResult.status === 'calculated' ? doseResult.baseUnits : null,
      suggestedCorrectionUnits: doseResult.status === 'calculated' ? doseResult.correctionUnits : null,
      suggestedTotalUnits: doseResult.status === 'calculated' ? doseResult.suggestedTotalUnits : null,
      insulinPlanId: doseResult.insulinPlanId || null,
      insulinPlanSnapshot: doseResult.insulinPlanSnapshot || null,
      doseCalculationStatus: doseResult.status,
      notes: sanitizeNotes(form.elements.notes.value),
      recordTimestamp: new Date(recordTimestamp).toISOString(),
      createdAt: existing?.createdAt ?? nowTimestamp,
      updatedAt: nowTimestamp,
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
      <section class="levi_diabetes_editor" aria-labelledby="levi-diabetes-title">
        <h1 class="levi_diabetes_editor_title" id="levi-diabetes-title">Confirm insulin given</h1>
        <dl class="levi_diabetes_confirm_list">
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
        <p class="levi_diabetes_help">Based on the current clinician-provided insulin plan. Confirm the dose before giving insulin.</p>
        <div class="levi_diabetes_actions">
          <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost" data-action="back-to-editor">Go Back</button>
          <button type="button" class="levi_diabetes_button levi_diabetes_button--primary" data-action="confirm-save">Confirm and Save</button>
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

  function renderSettings(errorMessage = '') {
    const root = getRoot();
    if (!root) return;
    currentEditor = { mode: 'settings' };
    const plan = getCurrentPlan() || clonePlanSnapshot(DEFAULT_INSULIN_PLAN);
    root.innerHTML = `
      <form class="levi_diabetes_editor" data-plan-editor>
        <h1 class="levi_diabetes_editor_title" id="levi-diabetes-title">Settings</h1>
        ${renderTrackerNav('settings')}
        ${renderPersistenceStatus()}
        <section class="levi_diabetes_settings_section" aria-labelledby="levi-patient-title">
          <h2 class="levi_diabetes_section_title" id="levi-patient-title">Patient & Clinic</h2>
          <label class="levi_diabetes_field">
            Patient Name
            <input class="levi_diabetes_input" name="patientName" type="text" maxlength="80" value="${escapeHtml(trackerData.settings?.patientName || '')}">
          </label>
          <label class="levi_diabetes_field">
            Date of Birth
            <input class="levi_diabetes_input" name="patientBirthDate" type="date" value="${escapeHtml(trackerData.settings?.patientBirthDate || '')}">
          </label>
          <label class="levi_diabetes_field">
            Clinic Name
            <input class="levi_diabetes_input" name="clinicName" type="text" maxlength="120" value="${escapeHtml(trackerData.settings?.clinicName || '')}">
          </label>
          <label class="levi_diabetes_field">
            Clinic Phone
            <input class="levi_diabetes_input" name="clinicPhone" type="tel" maxlength="40" value="${escapeHtml(trackerData.settings?.clinicPhone || '')}">
          </label>
          <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost" data-action="save-patient-settings">Save Patient Info</button>
        </section>
        <section class="levi_diabetes_settings_section" aria-labelledby="levi-history-preferences-title">
          <h2 class="levi_diabetes_section_title" id="levi-history-preferences-title">History Preferences</h2>
          <label class="levi_diabetes_field">
            History Initial Window
            <select class="levi_diabetes_select" name="historyInitialWindow">
              ${HISTORY_WINDOW_OPTIONS.map((option) => {
                const currentValue = trackerData.settings?.historyInitialWindowDays || String(DEFAULT_HISTORY_WINDOW_DAYS);
                return `<option value="${escapeHtml(option.value)}" ${String(currentValue) === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`;
              }).join('')}
            </select>
          </label>
          <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost" data-action="save-history-preference">Save History Preference</button>
        </section>
        <section class="levi_diabetes_settings_section" aria-labelledby="levi-insulin-plan-title">
          <h2 class="levi_diabetes_section_title" id="levi-insulin-plan-title">Insulin Plan</h2>
          ${errorMessage ? `<p class="levi_diabetes_error">${escapeHtml(errorMessage)}</p>` : ''}
          <label class="levi_diabetes_field">
            Plan Name
            <input class="levi_diabetes_input" name="planName" type="text" maxlength="80" value="${escapeHtml(plan.name)}">
          </label>
          <label class="levi_diabetes_field">
            Effective Date
            <input class="levi_diabetes_input" name="effectiveFrom" type="date" required value="${escapeHtml(plan.effectiveFrom)}">
          </label>
          <label class="levi_diabetes_field">
            Meal Base Dose
            <input class="levi_diabetes_input" name="mealBaseUnits" type="number" inputmode="decimal" min="0" step="0.5" required value="${escapeHtml(plan.mealBaseUnits)}">
          </label>
          <div class="levi_diabetes_plan_meta">
            <span>Supported meals: ${escapeHtml(plan.supportedMealTypes.join(', '))}</span>
            <span>Last updated: ${escapeHtml(formatDate(new Date(plan.updatedAt)))}</span>
          </div>
          <fieldset class="levi_diabetes_ranges">
            <legend>Correction Table</legend>
            ${plan.correctionRanges.map(renderRangeEditorRow).join('')}
          </fieldset>
          <label class="levi_diabetes_field">
            Plan Notes
            <textarea class="levi_diabetes_textarea" name="notes" rows="4">${escapeHtml(plan.notes || '')}</textarea>
          </label>
        </section>
        <section class="levi_diabetes_settings_section" aria-labelledby="levi-backup-title">
          <h2 class="levi_diabetes_section_title" id="levi-backup-title">Local Backup</h2>
          <p class="levi_diabetes_help">Records stay on this device unless site data is cleared. Export a backup regularly.</p>
          <div class="levi_diabetes_backup_actions">
            <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost" data-action="export-backup">Export Data Backup</button>
            <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost" data-action="import-backup">Import Data Backup</button>
          </div>
          <input class="levi_diabetes_backup_input" type="file" accept="application/json,.json" data-backup-import aria-label="Import Lee-Lee’s Tracker data backup">
        </section>
        <div class="levi_diabetes_actions">
          <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost" data-action="cancel">Cancel</button>
          <button type="submit" class="levi_diabetes_button levi_diabetes_button--primary">Review Plan Change</button>
        </div>
      </form>
    `;
  }

  function renderRangeEditorRow(range, index) {
    return `
      <div class="levi_diabetes_range_row">
        <label>
          Minimum glucose
          <input class="levi_diabetes_input" name="rangeMin${index}" type="number" inputmode="numeric" min="0" step="1" value="${escapeHtml(range.minGlucose ?? '')}" placeholder="Below">
        </label>
        <label>
          Maximum glucose
          <input class="levi_diabetes_input" name="rangeMax${index}" type="number" inputmode="numeric" min="0" step="1" value="${escapeHtml(range.maxGlucose ?? '')}">
        </label>
        <label>
          Correction units
          <input class="levi_diabetes_input" name="rangeUnits${index}" type="number" inputmode="decimal" min="0" step="0.5" value="${escapeHtml(range.correctionUnits)}">
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
      <section class="levi_diabetes_editor" aria-labelledby="levi-diabetes-title">
        <h1 class="levi_diabetes_editor_title" id="levi-diabetes-title">Confirm insulin plan change</h1>
        <p class="levi_diabetes_help">You are changing the insulin plan used to calculate suggested doses.</p>
        <dl class="levi_diabetes_confirm_list">
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
        <label class="levi_diabetes_checkline">
          <span>I have verified these instructions with Levi’s diabetes care team.</span>
          <input type="checkbox" data-plan-confirm-check>
        </label>
        <div class="levi_diabetes_actions">
          <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost" data-action="settings">Go Back</button>
          <button type="button" class="levi_diabetes_button levi_diabetes_button--primary" data-action="confirm-plan" disabled>Activate Plan</button>
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
    setPersistenceStatus('saving');
    updateTrackerData((current) => ({
      ...current,
      settings: {
        ...(current.settings || {}),
        patientName: String(form.elements.patientName?.value || '').trim().slice(0, 80),
        patientBirthDate: /^\d{4}-\d{2}-\d{2}$/.test(String(form.elements.patientBirthDate?.value || ''))
          ? form.elements.patientBirthDate.value
          : '',
        clinicName: String(form.elements.clinicName?.value || '').trim().slice(0, 120),
        clinicPhone: String(form.elements.clinicPhone?.value || '').trim().slice(0, 40),
      },
    }));
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

  function openRecordEditor(recordId) {
    const record = records.find((item) => item.id === recordId);
    if (!record) return;
    renderEditor({
      mode: PRIMARY_TYPES.includes(record.type) ? 'primary' : 'extra',
      type: record.type,
      record,
      returnTo: 'history-day',
      returnDateKey: getRecordEventDateKey(record),
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
    setPersistenceStatus('saving');
    updateTrackerData((current) => ({
      ...current,
      records: current.records.filter((record) => record.id !== recordId),
    }));
    if (returnDateKey) {
      renderHistoryDay(returnDateKey);
    } else {
      renderHistory();
    }
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

  function init() {
    const root = getRoot();
    if (!root) return;
    root.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'edit-primary') {
        openPrimaryEditor(target.dataset.type);
      }
      if (action === 'extra') {
        openExtraEditor();
      }
      if (action === 'today') {
        renderHome();
      }
      if (action === 'history') {
        resetHistoryVisibleWindow();
        renderHistory();
      }
      if (action === 'export') {
        renderExport();
      }
      if (action === 'settings') {
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
      }
      if (action === 'export-backup') {
        exportDataBackup();
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
      if (!event.target.matches('[data-levi-editor], [data-plan-editor]')) return;
      event.preventDefault();
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
      const form = event.target.closest('[data-levi-editor]');
      if (!form) return;
      if (event.target.name === 'insulinUnits') {
        form.dataset.userEditedInsulin = 'true';
      }
      updateEditorState(form);
    });
    root.addEventListener('change', (event) => {
      const confirmCheck = event.target.closest('[data-plan-confirm-check]');
      if (confirmCheck) {
        const confirmButton = root.querySelector('[data-action="confirm-plan"]');
        if (confirmButton) confirmButton.disabled = !confirmCheck.checked;
        return;
      }
      const form = event.target.closest('[data-levi-editor]');
      if (!form) return;
      updateEditorState(form);
    });
    root.addEventListener('change', (event) => {
      if (event.target.matches('[data-backup-import]')) {
        handleBackupImport(event.target.files?.[0]);
        event.target.value = '';
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
      if (historyFilterSheetOpen && event.key === 'Escape') {
        event.preventDefault();
        closeHistoryFilters();
        return;
      }
      trapHistorySheetFocus(event);
    });
    window.addEventListener('storage', handleExternalStorageUpdate);
    requestPersistentStorage();
    renderHome();
  }

  window.LeeLeesTrackerStorage = {
    storageKey: TRACKER_STORAGE_KEY,
    schemaVersion: TRACKER_SCHEMA_VERSION,
    loadTrackerData,
    saveTrackerData,
    updateTrackerData,
    mergeTrackerDocuments,
    validateBackupPayload,
    createBackupDocument,
  };

  window.LeeLeesTrackerReports = {
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
    getVisibleHistoryGroups,
    getHistoryFilterCount,
    getHistoryFilterSummary,
    getDailySummaryCacheSize,
    buildClinicalReport,
    buildDetailedReportData,
    reportRegistry: REPORT_REGISTRY.map(({ id, title, description, printLayout }) => ({ id, title, description, printLayout })),
  };

  document.addEventListener('DOMContentLoaded', init);
})();
