import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const checklistSource = readFileSync(new URL('../js/road-bike-checklist.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/road-bike-checklist.css', import.meta.url), 'utf8');

function createLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    dump: () => Object.fromEntries(store),
  };
}

function createRoot() {
  return {
    innerHTML: '',
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    querySelector() {
      return null;
    },
  };
}

function createChecklist({ localStorage = createLocalStorage(), root = createRoot() } = {}) {
  const listeners = {};
  const context = {
    console,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    Date,
    JSON,
    Set,
    String,
    document: {
      readyState: 'loading',
      addEventListener(type, handler) {
        listeners[type] = handler;
      },
      getElementById(id) {
        return id === 'road-bike-checklist-root' ? root : null;
      },
    },
    localStorage,
    window: null,
  };
  context.window = context;
  context.globalThis = context;
  context.dispatchEvent = () => true;
  vm.runInNewContext(checklistSource, context);
  listeners.DOMContentLoaded?.();
  return { api: context.RoadBikeTripChecklist, localStorage, root };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

test('checklist route, view, script, and landing card are wired into the shell', () => {
  assert.match(html, /id="road-bike-checklist-view"/);
  assert.match(html, /id: 'road-bike-checklist'/);
  assert.match(html, /dataLauncherChecklistProgress|launcherChecklistProgress/);
  assert.match(html, /js\/road-bike-checklist\.js/);
  assert.match(html, /css\/road-bike-checklist\.css/);
});

test('landing progress summary is scoped plain text that fits its card', () => {
  const summaryRule = css.match(/\.clock_utility_card--road-bike \.clock_utility_progress_summary\s*\{(?<body>[^}]+)\}/);
  assert.ok(summaryRule, 'road bike launcher progress summary should be scoped to its card');

  const body = summaryRule.groups.body;
  assert.match(body, /box-sizing:\s*border-box;/);
  assert.match(body, /width:\s*100%;/);
  assert.match(body, /max-width:\s*420px;/);
  assert.match(body, /margin:\s*0 auto;/);
  assert.match(body, /padding:\s*0;/);
  assert.match(body, /border:\s*0;/);
  assert.match(body, /border-radius:\s*0;/);
  assert.match(body, /background:\s*transparent;/);
  assert.match(body, /text-align:\s*center;/);
  assert.doesNotMatch(css, /\.clock_utility_progress_summary\s*\{\s*width:\s*min\(100%,\s*420px\);/);
});

test('opening the checklist route resets the checklist view to the top without changing routing', () => {
  assert.match(html, /function scrollRoadBikeChecklistToTop\(\)/);
  assert.match(html, /const checklistView = document\.getElementById\('road-bike-checklist-view'\);/);
  assert.match(html, /checklistView\.scrollTop = 0;/);
  assert.match(html, /checklistView\.scrollTo\?\.\(\{ top: 0, left: 0, behavior: 'auto' \}\);/);
  assert.match(html, /document\.getElementById\('road-bike-checklist-root'\)/);
  assert.match(html, /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\);/);
  assert.match(html, /if \(route === 'road-bike-checklist'\) scrollRoadBikeChecklistToTop\(\);/);
  assert.match(html, /window\.location\.hash = route === 'home' \? '#\/' : `#\/\$\{route\}`;/);
});

test('renders all checklist sections and items', () => {
  const { root, api } = createChecklist();
  const sectionCount = api.CHECKLIST_SECTIONS.length;
  const itemCount = api.CHECKLIST_SECTIONS.reduce((sum, section) => sum + section.items.length, 0);

  assert.equal(sectionCount, 7);
  assert.equal(itemCount, 64);
  api.CHECKLIST_SECTIONS.forEach((section) => {
    assert.ok(root.innerHTML.includes(escapeHtml(section.title)), `${section.title} should render`);
    section.items.forEach((item) => {
      assert.ok(root.innerHTML.includes(escapeHtml(item.text)), `${item.text} should render`);
    });
  });
  assert.match(root.innerHTML, /type="checkbox"/);
  assert.doesNotMatch(root.innerHTML, /\[[ x]\]/i);
});

test('checking and unchecking an item updates progress counts', () => {
  const { api } = createChecklist();

  api.setItemChecked('helmet', true);
  assert.equal(api.getProgress().checked, 1);
  assert.equal(api.getProgress().total, 64);
  assert.equal(api.getProgress().percent, 2);

  api.setItemChecked('helmet', false);
  assert.equal(api.getProgress().checked, 0);
  assert.equal(api.getProgress().total, 64);
  assert.equal(api.getProgress().percent, 0);
});

test('checked state is persisted using a versioned stable-ID document', () => {
  const { api, localStorage } = createChecklist();
  api.setItemChecked('helmet', true);
  api.setItemChecked('bike-computer', true);

  const stored = JSON.parse(localStorage.getItem(api.STORAGE_KEY));
  assert.equal(stored.version, 1);
  assert.deepEqual(stored.checkedItemIds.sort(), ['bike-computer', 'helmet']);
  assert.match(stored.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('persisted state is restored on startup', () => {
  const seed = {
    'lando-world:road-bike-trip-checklist:v1': JSON.stringify({
      version: 1,
      checkedItemIds: ['helmet', 'bike-computer'],
      updatedAt: '2026-08-04T12:00:00.000Z',
    }),
  };
  const { api, root } = createChecklist({ localStorage: createLocalStorage(seed) });

  assert.equal(api.getProgress().checked, 2);
  assert.match(root.innerHTML, /id="road-bike-item-helmet" type="checkbox"[^>]*checked/);
});

test('malformed localStorage recovers to an empty checklist', () => {
  const { api } = createChecklist({
    localStorage: createLocalStorage({
      'lando-world:road-bike-trip-checklist:v1': '{bad json',
    }),
  });

  assert.equal(api.getProgress().checked, 0);
  assert.equal(api.getProgress().total, 64);
  assert.equal(api.getProgress().percent, 0);
});

test('unknown stored IDs are ignored and duplicate IDs are deduplicated', () => {
  const { api } = createChecklist({
    localStorage: createLocalStorage({
      'lando-world:road-bike-trip-checklist:v1': JSON.stringify({
        version: 1,
        checkedItemIds: ['helmet', 'unknown-future-item', 'helmet'],
        updatedAt: '2026-08-04T12:00:00.000Z',
      }),
    }),
  });

  assert.deepEqual([...api.readState().checkedItemIds], ['helmet']);
  assert.equal(api.getProgress().checked, 1);
});

test('reset confirmation flow preserves or clears progress based on confirmation', async () => {
  const { api, root } = createChecklist();
  api.saveCheckedItemIds(['helmet', 'wallet']);

  const canceled = await api.requestReset(root, () => Promise.resolve(false));
  assert.equal(canceled, false);
  assert.equal(api.getProgress().checked, 2);

  const reset = await api.requestReset(root, () => Promise.resolve(true));
  assert.equal(reset, true);
  assert.equal(api.getProgress().checked, 0);
  assert.equal(api.getProgress().total, 64);
  assert.equal(api.getProgress().percent, 0);
});
