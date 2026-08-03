import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const trackerSource = readFileSync(new URL('../js/levi-diabetes-tracker.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../css/levi-diabetes.css', import.meta.url), 'utf8');

function createLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

function createTrackerReports() {
  const context = {
    console,
    Date,
    Intl,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Promise,
    RegExp,
    String,
    crypto: {
      randomUUID: () => `test-${Math.random().toString(36).slice(2)}`,
    },
    document: {
      addEventListener() {},
      getElementById: () => null,
    },
    localStorage: createLocalStorage(),
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
  return context.LeeLeesTrackerReports;
}

function record(overrides = {}) {
  return {
    id: `record-${Math.random()}`,
    type: 'Breakfast',
    bloodSugar: 180,
    insulinUnits: 5,
    administeredInsulinUnits: 5,
    suggestedTotalUnits: 7,
    suggestedBaseUnits: 4,
    suggestedCorrectionUnits: 3,
    recordTimestamp: '2026-08-01T07:42:00.000Z',
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    notes: '',
    ...overrides,
  };
}

test('history grouping uses recordTimestamp rather than createdAt and sorts days newest first', () => {
  const reports = createTrackerReports();
  const groups = reports.groupRecordsByLocalDate([
    record({ id: 'entered-later', recordTimestamp: '2026-08-01T07:42:00.000Z', createdAt: '2026-08-03T12:00:00.000Z' }),
    record({ id: 'newer-day', recordTimestamp: '2026-08-02T10:00:00.000Z', createdAt: '2026-08-02T10:00:00.000Z' }),
  ]);

  assert.deepEqual(Array.from(groups, (group) => group.dateKey), ['2026-08-02', '2026-08-01']);
  assert.equal(groups[1].records[0].id, 'entered-later');
});

test('records inside a history day are ordered chronologically by event time', () => {
  const reports = createTrackerReports();
  const groups = reports.groupRecordsByLocalDate([
    record({ id: 'lunch', type: 'Lunch', recordTimestamp: '2026-08-01T12:00:00.000Z' }),
    record({ id: 'breakfast', type: 'Breakfast', recordTimestamp: '2026-08-01T07:42:00.000Z' }),
    record({ id: 'bedtime', type: 'Bedtime', recordTimestamp: '2026-08-01T21:00:00.000Z' }),
  ]);

  assert.deepEqual(Array.from(groups[0].records, (item) => item.id), ['breakfast', 'lunch', 'bedtime']);
});

test('daily summary uses valid glucose and actual administered insulin only', () => {
  const reports = createTrackerReports();
  const summary = reports.calculateDailySummary([
    record({ id: 'a', bloodSugar: 198, administeredInsulinUnits: 5, suggestedTotalUnits: 7 }),
    record({ id: 'b', bloodSugar: 102, administeredInsulinUnits: null, insulinUnits: null, suggestedTotalUnits: 4 }),
    record({ id: 'c', bloodSugar: null, administeredInsulinUnits: 2, suggestedTotalUnits: 8 }),
  ]);

  assert.equal(summary.entryCount, 3);
  assert.equal(summary.averageBloodSugar, 150);
  assert.equal(summary.highestBloodSugar, 198);
  assert.equal(summary.lowestBloodSugar, 102);
  assert.equal(summary.totalInsulin, 7);
});

test('legacy insulinUnits displays as actual insulin and missing insulin does not crash', () => {
  const reports = createTrackerReports();
  const summary = reports.calculateDailySummary([
    { id: 'legacy', type: 'Correction', bloodSugar: 210, insulinUnits: 3, date: '2026-08-01', time: '13:30' },
    { id: 'missing', type: 'Snack', bloodSugar: 120, date: '2026-08-01', time: '15:30' },
  ]);

  assert.equal(reports.getRecordActualInsulin({ insulinUnits: 3 }), 3);
  assert.equal(summary.totalInsulin, 3);
});

test('date and entry-type filters return the correct records across month boundaries', () => {
  const reports = createTrackerReports();
  const source = [
    record({ id: 'jul31-breakfast', type: 'Breakfast', recordTimestamp: '2026-07-31T07:42:00.000Z' }),
    record({ id: 'aug01-lunch', type: 'Lunch', recordTimestamp: '2026-08-01T12:00:00.000Z' }),
    record({ id: 'aug02-breakfast', type: 'Breakfast', recordTimestamp: '2026-08-02T08:00:00.000Z' }),
  ];
  const ranged = reports.filterRecordsByDateRange(source, {
    range: 'custom',
    startDate: '2026-07-31',
    endDate: '2026-08-01',
  });
  const typed = reports.filterRecordsByEntryType(ranged, 'Breakfast');

  assert.deepEqual(ranged.map((item) => item.id).sort(), ['aug01-lunch', 'jul31-breakfast']);
  assert.deepEqual(typed.map((item) => item.id), ['jul31-breakfast']);
});

test('clinical log keeps earliest primary record and includes additional checks', () => {
  const reports = createTrackerReports();
  const log = reports.buildClinicalLog([
    record({ id: 'breakfast-1', type: 'Breakfast', recordTimestamp: '2026-08-01T07:42:00.000Z' }),
    record({ id: 'breakfast-2', type: 'Breakfast', recordTimestamp: '2026-08-01T08:15:00.000Z' }),
    record({ id: 'snack', type: 'Snack', recordTimestamp: '2026-08-01T10:30:00.000Z' }),
  ]);

  assert.equal(log[0].primary.Breakfast.id, 'breakfast-1');
  assert.deepEqual(Array.from(log[0].additionalRecords, (item) => item.id), ['breakfast-2', 'snack']);
});

test('detailed report includes every selected record', () => {
  const reports = createTrackerReports();
  const detailed = reports.buildDetailedReport([
    record({ id: 'a', recordTimestamp: '2026-08-01T07:42:00.000Z' }),
    record({ id: 'b', type: 'Snack', recordTimestamp: '2026-08-01T10:30:00.000Z' }),
    record({ id: 'c', type: 'Dinner', recordTimestamp: '2026-08-02T18:30:00.000Z' }),
  ]);

  assert.equal(detailed.reduce((count, group) => count + group.records.length, 0), 3);
});

test('older records reconstruct event time from date and time fields', () => {
  const reports = createTrackerReports();
  const legacy = { id: 'legacy', type: 'Breakfast', date: '2026-08-01', time: '07:42', bloodSugar: 198, insulinUnits: 5 };
  assert.equal(reports.getRecordEventDateKey(legacy), '2026-08-01');
  assert.match(reports.formatTime(reports.getRecordTimestamp(legacy)), /7:42/);
});

test('print styles hide controls and use a white printable report', () => {
  assert.match(cssSource, /@media print/);
  assert.match(cssSource, /\.levi_diabetes_nav,[\s\S]*display: none !important/);
  assert.match(cssSource, /background: #ffffff !important/);
});

test('export print action uses the browser print dialog', () => {
  assert.match(trackerSource, /window\.print\(\)/);
});

test('history visible window returns the newest day groups first', () => {
  const reports = createTrackerReports();
  const groups = reports.groupRecordsByLocalDate(Array.from({ length: 45 }, (_, index) => record({
    id: `day-${index}`,
    recordTimestamp: new Date(Date.UTC(2026, 7, 1 + index, 12)).toISOString(),
  })));
  const visible = reports.getVisibleHistoryGroups(groups, 30);

  assert.equal(visible.length, 30);
  assert.equal(visible[0].dateKey, '2026-09-14');
  assert.equal(visible[29].dateKey, '2026-08-16');
});

test('history filter summary and badge count reflect active filters', () => {
  const reports = createTrackerReports();

  assert.equal(reports.getHistoryFilterSummary({ range: 'all', type: 'All' }), 'All records · All Entries');
  assert.equal(reports.getHistoryFilterCount({ range: 'all', type: 'All' }), 0);
  assert.equal(reports.getHistoryFilterSummary({ range: 'last30', type: 'Breakfast' }), 'Last 30 days · Breakfast');
  assert.equal(reports.getHistoryFilterCount({ range: 'last30', type: 'Breakfast' }), 2);
});

test('daily summaries are memoized for identical record groups', () => {
  const reports = createTrackerReports();
  const source = [
    record({ id: 'memo-a', bloodSugar: 100, updatedAt: '2026-08-01T12:00:00.000Z' }),
    record({ id: 'memo-b', bloodSugar: 200, updatedAt: '2026-08-01T12:05:00.000Z' }),
  ];
  const first = reports.calculateDailySummary(source);
  const cacheAfterFirst = reports.getDailySummaryCacheSize();
  const second = reports.calculateDailySummary([...source].reverse());

  assert.equal(first, second);
  assert.equal(reports.getDailySummaryCacheSize(), cacheAfterFirst);
});

test('report registry describes current reports independently from export rendering', () => {
  const reports = createTrackerReports();
  const ids = Array.from(reports.reportRegistry, (report) => report.id);

  assert.deepEqual(ids, ['clinical', 'detailed']);
  assert.equal(reports.reportRegistry[0].printLayout, 'landscape');
  assert.equal(reports.buildClinicalReport([record({ id: 'clinical-source' })]).id, 'clinical');
  assert.equal(reports.buildDetailedReportData([record({ id: 'detailed-source' })]).id, 'detailed');
});
