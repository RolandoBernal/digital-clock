import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const trackerSource = readFileSync(new URL('../js/levi-diabetes-tracker.js', import.meta.url), 'utf8');
const storageKey = 'lando-world:lee-lees-tracker:v1';
const legacyRecordsKey = 'levi_diabetes_records_v1';
const legacyPlansKey = 'levi_diabetes_insulin_plans_v1';

function createLocalStorage(seed = {}, options = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => {
      if (options.failWritesFor?.includes(key)) throw new Error('quota');
      store.set(key, String(value));
    },
    removeItem: (key) => store.delete(key),
    dump: () => Object.fromEntries(store),
  };
}

function createTracker({ localStorage = createLocalStorage() } = {}) {
  const root = {
    addEventListener() {},
    querySelector() {
      return null;
    },
    innerHTML: '',
  };
  const context = {
    Blob,
    console,
    Date,
    FileReader: class {},
    Intl,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Promise,
    RegExp,
    String,
    URL: {
      createObjectURL: () => 'blob:test',
      revokeObjectURL() {},
    },
    crypto: {
      randomUUID: () => `test-${Math.random().toString(36).slice(2)}`,
    },
    document: {
      addEventListener() {},
      body: { append() {} },
      createElement: () => ({ click() {}, remove() {} }),
      getElementById: () => root,
    },
    localStorage,
    navigator: {
      language: 'en-US',
      storage: {
        persist: () => Promise.resolve(false),
      },
    },
    window: null,
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(trackerSource, context);
  return { storage: context.LeeLeesTrackerStorage, localStorage };
}

function sampleRecord(overrides = {}) {
  return {
    id: 'record-1',
    timestamp: 1785501720000,
    type: 'Breakfast',
    bloodSugar: 198,
    insulinUnits: 5,
    notes: 'Entered later',
    unknownFutureField: 'preserve me',
    ...overrides,
  };
}

test('migrates legacy record and plan keys into the stable tracker document without deleting legacy data', () => {
  const localStorage = createLocalStorage({
    [legacyRecordsKey]: JSON.stringify([sampleRecord()]),
    [legacyPlansKey]: JSON.stringify([{
      id: 'plan-1',
      name: 'Plan',
      effectiveFrom: '2026-07-31',
      mealBaseUnits: 4,
      supportedMealTypes: ['Breakfast', 'Lunch', 'Dinner'],
      correctionRanges: [{ minGlucose: null, maxGlucose: 174, correctionUnits: 0 }],
    }]),
  });
  createTracker({ localStorage });

  const stored = JSON.parse(localStorage.getItem(storageKey));
  assert.equal(stored.schemaVersion, 1);
  assert.equal(stored.records.length, 1);
  assert.equal(stored.records[0].id, 'record-1');
  assert.equal(stored.records[0].recordTimestamp, '2026-07-31T12:42:00.000Z');
  assert.equal(stored.records[0].unknownFutureField, 'preserve me');
  assert.equal(stored.insulinPlans.some((plan) => plan.id === 'plan-1'), true);
  assert.ok(localStorage.getItem(legacyRecordsKey));
  assert.ok(localStorage.getItem(legacyPlansKey));
});

test('hydration preserves an existing stable document instead of overwriting with empty defaults', () => {
  const documentPayload = {
    schemaVersion: 1,
    records: [sampleRecord({ recordTimestamp: '2026-07-31T12:15:00.000Z' })],
    settings: { targetRange: 'custom' },
    insulinPlans: [],
    activeInsulinPlanId: null,
    metadata: {
      createdAt: '2026-07-31T12:15:00.000Z',
      updatedAt: '2026-07-31T12:15:00.000Z',
    },
  };
  const localStorage = createLocalStorage({
    [storageKey]: JSON.stringify(documentPayload),
  });

  createTracker({ localStorage });
  createTracker({ localStorage });

  const stored = JSON.parse(localStorage.getItem(storageKey));
  assert.equal(stored.records.length, 1);
  assert.equal(stored.records[0].bloodSugar, 198);
  assert.equal(stored.settings.targetRange, 'custom');
});

test('transactional updates begin from the latest stored document and keep rapid records', () => {
  const { storage, localStorage } = createTracker();
  const first = sampleRecord({ id: 'rapid-1', recordTimestamp: '2026-07-31T13:00:00.000Z' });
  const second = sampleRecord({ id: 'rapid-2', recordTimestamp: '2026-07-31T13:05:00.000Z' });

  storage.updateTrackerData((current) => ({ ...current, records: [...current.records, first] }));
  storage.updateTrackerData((current) => ({ ...current, records: [...current.records, second] }));

  const stored = JSON.parse(localStorage.getItem(storageKey));
  assert.equal(stored.records.length, 2);
  assert.deepEqual(stored.records.map((record) => record.id).sort(), ['rapid-1', 'rapid-2']);
});

test('backup validation normalizes records and deduplicates by record ID', () => {
  const { storage } = createTracker();
  const backup = {
    appIdentifier: 'lando-world:lee-lees-tracker',
    schemaVersion: 1,
    records: [
      sampleRecord({ id: 'dupe', bloodSugar: 180 }),
      sampleRecord({ id: 'dupe', bloodSugar: 181, updatedAt: '2026-07-31T13:30:00.000Z' }),
    ],
    settings: {},
    insulinPlans: [],
    metadata: {
      createdAt: '2026-07-31T12:15:00.000Z',
      updatedAt: '2026-07-31T12:15:00.000Z',
    },
  };

  const result = storage.validateBackupPayload(backup);
  assert.equal(result.error, undefined);
  assert.equal(result.data.records.length, 1);
  assert.equal(result.data.records[0].id, 'dupe');
  assert.equal(result.data.records[0].unknownFutureField, 'preserve me');
});

test('failed stable-key writes keep the in-memory document available without clearing stored records', () => {
  const localStorage = createLocalStorage({
    [storageKey]: JSON.stringify({
      schemaVersion: 1,
      records: [sampleRecord()],
      settings: {},
      insulinPlans: [],
      metadata: {
        createdAt: '2026-07-31T12:15:00.000Z',
        updatedAt: '2026-07-31T12:15:00.000Z',
      },
    }),
  }, { failWritesFor: [storageKey] });
  const { storage } = createTracker({ localStorage });
  const result = storage.updateTrackerData((current) => ({
    ...current,
    records: [...current.records, sampleRecord({ id: 'unsaved-visible' })],
  }));

  assert.equal(result.ok, false);
  assert.equal(storage.createBackupDocument().records.some((record) => record.id === 'unsaved-visible'), true);
  assert.equal(JSON.parse(localStorage.getItem(storageKey)).records.length, 1);
});
