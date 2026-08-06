import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import vm from 'node:vm';

const checklistSource = readFileSync(new URL('../js/road-bike-checklist.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/road-bike-checklist.css', import.meta.url), 'utf8');
const roadBikeIconPng = readFileSync(new URL('../icons/road-bike-checklist.png', import.meta.url));

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


function readRgbaPngMetrics(buffer, points) {
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      assert.equal(data[12], 0, 'icon PNG should be non-interlaced');
    }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
  }

  assert.equal(bitDepth, 8, 'icon PNG should use 8-bit channels');
  assert.equal(colorType, 6, 'icon PNG should include an alpha channel');

  const raw = inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const rows = [];
  let previous = Buffer.alloc(stride);
  let rawOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset];
    rawOffset += 1;
    const scanline = raw.subarray(rawOffset, rawOffset + stride);
    rawOffset += stride;
    const row = Buffer.alloc(stride);

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x];
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      let prediction = 0;

      if (filter === 1) prediction = left;
      if (filter === 2) prediction = up;
      if (filter === 3) prediction = Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        prediction = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }

      row[x] = (scanline[x] + prediction) & 255;
    }

    rows.push(row);
    previous = row;
  }

  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rows[y][x * bytesPerPixel + 3] > 8) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return {
    width,
    height,
    alpha: Object.fromEntries(points.map(([name, x, y]) => [name, rows[y][x * bytesPerPixel + 3]])),
    visibleBounds: {
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      widthCoverage: (maxX - minX + 1) / width,
      heightCoverage: (maxY - minY + 1) / height,
    },
  };
}

test('checklist route, view, script, and landing card are wired into the shell', () => {
  assert.match(html, /id="road-bike-checklist-view"/);
  assert.match(html, /id: 'road-bike-checklist'/);
  assert.match(html, /dataLauncherChecklistProgress|launcherChecklistProgress/);
  assert.match(html, /js\/road-bike-checklist\.js/);
  assert.match(html, /css\/road-bike-checklist\.css/);
});



test('road bike icon assets use the shared PNG path, transparent corners, and normalized visual bounds', () => {
  assert.match(html, /<img class="digit_clock_logo" src="icons\/road-bike-checklist\.png"/);
  assert.match(html, /iconSrc: 'icons\/road-bike-checklist\.png'/);
  assert.doesNotMatch(html, /road-bike-trip-checklist-icon/);

  const metrics = readRgbaPngMetrics(roadBikeIconPng, [
    ['topLeft', 0, 0],
    ['topRight', 1023, 0],
    ['bottomLeft', 0, 1023],
    ['bottomRight', 1023, 1023],
    ['center', 512, 512],
  ]);
  assert.deepEqual({
    topLeft: metrics.alpha.topLeft,
    topRight: metrics.alpha.topRight,
    bottomLeft: metrics.alpha.bottomLeft,
    bottomRight: metrics.alpha.bottomRight,
  }, {
    topLeft: 0,
    topRight: 0,
    bottomLeft: 0,
    bottomRight: 0,
  });
  assert.ok(metrics.alpha.center > 0, 'icon artwork should remain opaque inside the border');
  assert.ok(metrics.visibleBounds.widthCoverage >= 0.82, 'icon visible width should match ecosystem icon scale');
  assert.ok(metrics.visibleBounds.widthCoverage <= 0.86, 'icon visible width should not overflow the ecosystem icon scale');
  assert.ok(metrics.visibleBounds.heightCoverage >= 0.82, 'icon visible height should match ecosystem icon scale');
  assert.ok(metrics.visibleBounds.heightCoverage <= 0.87, 'icon visible height should not overflow the ecosystem icon scale');
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
  assert.match(html, /function resetEcosystemScrollPosition\(activeView\)/);
  assert.match(html, /document\.scrollingElement/);
  assert.match(html, /target\.scrollTo\(\{ top: 0, left: 0, behavior: 'instant' \}\)/);
  assert.match(html, /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'instant' \}\)/);
  assert.match(html, /window\.requestAnimationFrame\?\.\(\(\) => \{/);
  assert.match(html, /updateEcosystemNavState\(\)/);
  assert.match(html, /'road-bike-checklist',/);
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
