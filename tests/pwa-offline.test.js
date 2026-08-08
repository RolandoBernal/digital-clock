import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const pwaManager = readFileSync(new URL('../js/pwa-manager.js', import.meta.url), 'utf8');
const digitalClockCss = readFileSync(new URL('../css/digital-clock.css', import.meta.url), 'utf8');
const sprintsCss = readFileSync(new URL('../css/sprints.css', import.meta.url), 'utf8');
const roadBikeCss = readFileSync(new URL('../css/road-bike-checklist.css', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));

function createElementStub() {
  return {
    hidden: false,
    innerHTML: '',
    textContent: '',
    attributes: {},
    classList: {
      values: new Set(),
      toggle(name, force) {
        if (force) this.values.add(name);
        else this.values.delete(name);
      },
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
  };
}

function createPwaContext({
  onLine = true,
  serviceWorker,
  caches,
  storage,
  standalone = false,
} = {}) {
  const documentListeners = {};
  const windowListeners = {};
  const elements = {
    'pwa-network-status': createElementStub(),
    'pwa-toast': createElementStub(),
    'pwa-offline-settings': createElementStub(),
  };
  const localStorageStore = new Map();
  const context = {
    console: {
      ...console,
      warn: () => {},
    },
    alert: () => {},
    confirm: () => true,
    CustomEvent: class CustomEvent {
      constructor(type) {
        this.type = type;
      }
    },
    Intl,
    MessageChannel: class MessageChannel {
      constructor() {
        const port1 = { onmessage: null, close: () => {} };
        const port2 = { onmessage: null, close: () => {} };
        port1.postMessage = (data) => port2.onmessage?.({ data });
        port2.postMessage = (data) => port1.onmessage?.({ data });
        this.port1 = port1;
        this.port2 = port2;
      }
    },
    Number,
    Promise,
    Set,
    String,
    clearTimeout,
    document: {
      addEventListener(type, handler) {
        documentListeners[type] = handler;
      },
      getElementById(id) {
        return elements[id] || null;
      },
    },
    localStorage: {
      getItem(key) {
        return localStorageStore.get(key) || null;
      },
      setItem(key, value) {
        localStorageStore.set(key, String(value));
      },
      removeItem(key) {
        localStorageStore.delete(key);
      },
    },
    matchMedia: () => ({ matches: standalone }),
    navigator: {
      onLine,
      standalone,
      serviceWorker,
      storage,
    },
    setTimeout,
    window: null,
  };
  context.window = context;
  context.globalThis = context;
  context.addEventListener = (type, handler) => {
    windowListeners[type] ||= [];
    windowListeners[type].push(handler);
  };
  context.dispatchEvent = () => true;
  if (caches) context.caches = caches;
  vm.runInNewContext(pwaManager, context);
  documentListeners.DOMContentLoaded?.();
  return { context, documentListeners, elements, windowListeners };
}

async function flushAsync() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

test('service worker precaches the app shell and app modules needed for offline launch', () => {
  [
    './index.html',
    './index-digital-clock.html',
    './manifest.webmanifest',
    './css/digital-clock.css',
    './css/app-themes.css',
    './css/weather-app.css',
    './css/daily-chief-briefing.css',
    './css/lee-lee-diabetes.css',
    './css/sprints.css',
    './css/road-bike-checklist.css',
    './js/pwa-manager.js',
    './js/weather-service.js',
    './js/weather-app.js',
    './js/daily-chief-briefing.js',
    './js/lee-lee-diabetes-tracker.js',
    './js/sprints-app.js',
    './js/road-bike-checklist.js',
    './fonts/digital-7.ttf',
    './icons/landos-world.svg',
    './icons/weather.png',
    './icons/digital-clock.png',
    './icons/lee-lees-tracker.png',
    './icons/violet-sprints.png',
    './icons/road-bike-checklist.png',
    './icons/death-on-notecards.png',
  ].forEach((asset) => assert.match(sw, new RegExp(asset.replaceAll('.', '\\.'))));
});

test('service worker uses separate versioned caches and strategy-specific runtime handling', () => {
  assert.match(sw, /const SW_VERSION = '2026-08-05-4'/);
  assert.match(sw, /const APP_CACHE = `landos-world-app-\$\{SW_VERSION\}`/);
  assert.match(sw, /const WEATHER_CACHE = `landos-world-weather-\$\{SW_VERSION\}`/);
  assert.match(sw, /const IMAGE_CACHE = `landos-world-images-\$\{SW_VERSION\}`/);
  assert.match(sw, /async function cacheFirst/);
  assert.match(sw, /async function staleWhileRevalidate/);
  assert.match(sw, /async function networkFirst/);
  assert.match(sw, /new Request\(url, \{ cache: 'reload' \}\)/);
  assert.match(sw, /WEATHER_HOSTS\.has\(url\.hostname\)/);
});

test('application cache cleanup is separated from localStorage user data', () => {
  assert.match(sw, /CLEAR_APPLICATION_CACHES/);
  assert.match(sw, /APPLICATION_CACHES_REBUILT/);
  assert.match(sw, /precacheApplicationShell\('rebuild'\)/);
  assert.match(sw, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(sw, /localStorage|indexedDB|deleteDatabase/);
  assert.match(pwaManager, /Cache cleanup never deletes Lee-Lee's Tracker records/);
  assert.doesNotMatch(pwaManager, /localStorage\.clear\(\)/);
  assert.doesNotMatch(pwaManager, /setTimeout\(\(\) => window\.location\.reload/);
});

test('offline, install, update, and settings UI hooks are present and accessible', () => {
  assert.match(html, /id="pwa-network-status" role="status" aria-live="polite"/);
  assert.match(html, /id="pwa-toast" role="status" aria-live="polite"/);
  assert.match(html, /href="#\/settings" aria-label="Lando's World Settings"/);
  assert.match(html, /id="lando-settings-view" hidden/);
  assert.match(html, /id="pwa-offline-settings" aria-live="polite"/);
  assert.match(pwaManager, /<section class="pwa_offline_panel" id="pwa-offline-panel" aria-labelledby="pwa-offline-title">/);
  assert.match(pwaManager, /beforeinstallprompt/);
  assert.match(pwaManager, /Update available/);
  assert.match(pwaManager, /data-pwa-action="restart"/);
  assert.match(pwaManager, /navigator\.storage\.persist/);
  assert.match(pwaManager, /navigator\.storage\.estimate/);
  assert.match(digitalClockCss, /\.pwa_network_status/);
  assert.match(digitalClockCss, /\.ecosystem_nav/);
  assert.match(digitalClockCss, /\.is-ecosystem-scrolled \.ecosystem_nav/);
  assert.match(digitalClockCss, /\.lando_settings_link/);
  assert.match(digitalClockCss, /\.lando_settings_shell/);
  assert.match(digitalClockCss, /\.pwa_offline_panel/);
});

test('Application Status lives in the ecosystem settings view outside Digital Clock', () => {
  const settingsViewStart = html.indexOf('id="lando-settings-view"');
  const dailyBriefingStart = html.indexOf('id="daily-chief-briefing-view"');
  const clockViewStart = html.indexOf('id="clock-view"');
  const sprintsViewStart = html.indexOf('id="sprints-view"');
  const settingsView = html.slice(settingsViewStart, dailyBriefingStart);
  const digitalClockView = html.slice(clockViewStart, sprintsViewStart);

  assert.ok(settingsViewStart > 0);
  assert.ok(dailyBriefingStart > settingsViewStart);
  assert.ok(sprintsViewStart > clockViewStart);
  assert.match(settingsView, /Lando's World Settings/);
  assert.match(settingsView, /id="pwa-offline-settings" aria-live="polite"/);
  assert.doesNotMatch(digitalClockView, /id="pwa-offline-settings"/);
  assert.match(html, /settings: document\.getElementById\('lando-settings-view'\)/);
  assert.match(html, /if \(viewName === 'settings'\) return "Lando's World Settings"/);
  assert.match(html, /'settings',/);
});

test('PWA settings panel renders directly on the settings screen', () => {
  const { elements } = createPwaContext();
  const settings = elements['pwa-offline-settings'];

  assert.match(settings.innerHTML, /<section class="pwa_offline_panel" id="pwa-offline-panel" aria-labelledby="pwa-offline-title">/);
  assert.match(settings.innerHTML, /Application Status/);
  assert.match(settings.innerHTML, /<dt>Application Version<\/dt>\s*<dd>Not available<\/dd>/);
  assert.match(settings.innerHTML, /Clear Application Cache/);
  assert.match(settings.innerHTML, /Cache cleanup never deletes Lee-Lee's Tracker records or other local app data/);
  assert.doesNotMatch(settings.innerHTML, /toggle-offline-settings|Show Application Status|Hide Application Status|hidden/);
});

test('PWA panel reports browser connection separately from installation status', () => {
  const { context, elements, windowListeners } = createPwaContext({
    onLine: false,
    standalone: false,
  });

  assert.match(elements['pwa-offline-settings'].innerHTML, /<dt>Connection<\/dt>\s*<dd class="[^"]*">Offline<\/dd>/);
  assert.match(elements['pwa-offline-settings'].innerHTML, /<dt>Application Installed<\/dt>\s*<dd class="[^"]*">No<\/dd>/);
  assert.match(elements['pwa-offline-settings'].innerHTML, /<dt>Offline Ready<\/dt>\s*<dd class="[^"]*">Unavailable<\/dd>/);

  context.navigator.onLine = true;
  windowListeners.online[0]();
  assert.match(elements['pwa-offline-settings'].innerHTML, /<dt>Connection<\/dt>\s*<dd class="[^"]*">Online<\/dd>/);
  assert.match(elements['pwa-offline-settings'].innerHTML, /<dt>Application Installed<\/dt>\s*<dd class="[^"]*">No<\/dd>/);

  context.navigator.onLine = false;
  windowListeners.offline[0]();
  assert.match(elements['pwa-offline-settings'].innerHTML, /<dt>Connection<\/dt>\s*<dd class="[^"]*">Offline<\/dd>/);
});

test('PWA panel marks offline readiness from app-shell cache status', async () => {
  const messages = [];
  const serviceWorker = {
    controller: {
      postMessage(message, ports = []) {
        messages.push(message);
        ports[0]?.postMessage({
          type: 'CACHE_STATUS',
          requestId: message.requestId,
          status: {
            appCacheReady: true,
            cachedRequestCount: 42,
            version: '2026-08-05-1',
            updatedAt: '2026-08-04T22:45:00.000Z',
          },
        });
      },
    },
    ready: Promise.resolve({ active: true }),
    register: () => Promise.resolve({ active: true, addEventListener: () => {} }),
    addEventListener: () => {},
  };
  const { elements } = createPwaContext({
    serviceWorker,
    caches: {},
  });
  await flushAsync();

  assert.ok(messages.some((message) => message.type === 'GET_CACHE_STATUS'));
  assert.match(elements['pwa-offline-settings'].innerHTML, /<dt>Application Version<\/dt>\s*<dd>2026-08-05-1<\/dd>/);
  assert.match(elements['pwa-offline-settings'].innerHTML, /<dt>Offline Ready<\/dt>\s*<dd class="[^"]*">Ready<\/dd>/);
  assert.doesNotMatch(elements['pwa-offline-settings'].innerHTML, /Preparing<\/dd>/);
  assert.doesNotMatch(elements['pwa-offline-settings'].innerHTML, /<dt>Last Cache Update<\/dt>\s*<dd>Not available<\/dd>/);
});

test('PWA panel reports first active-but-uncontrolled load as Ready after refresh', async () => {
  const activeWorker = {
    state: 'activated',
    scriptURL: 'http://localhost:8000/service-worker.js',
    postMessage(message, ports = []) {
      ports[0]?.postMessage({
        type: 'CACHE_STATUS',
        requestId: message.requestId,
        status: {
          appCacheReady: true,
          cachedRequestCount: 42,
          updatedAt: '2026-08-04T22:45:00.000Z',
        },
      });
    },
  };
  const serviceWorker = {
    controller: null,
    ready: Promise.resolve({ active: activeWorker, scope: 'http://localhost:8000/' }),
    register: () => Promise.resolve({
      active: activeWorker,
      scope: 'http://localhost:8000/',
      addEventListener: () => {},
    }),
    addEventListener: () => {},
  };
  const { elements } = createPwaContext({
    serviceWorker,
    caches: {},
  });
  await flushAsync();

  assert.match(elements['pwa-offline-settings'].innerHTML, /<dt>Offline Ready<\/dt>\s*<dd class="[^"]*">Ready after refresh<\/dd>/);
  assert.match(elements['pwa-offline-settings'].innerHTML, /<dt>Last Cache Update<\/dt>\s*<dd>(?!Not available)/);
});

test('PWA panel reports registration and cache support failures instead of staying on Preparing', async () => {
  const failingServiceWorker = {
    ready: Promise.resolve({ active: true }),
    register: () => Promise.reject(new Error('registration failed')),
    addEventListener: () => {},
  };
  const failed = createPwaContext({
    serviceWorker: failingServiceWorker,
    caches: {},
  });
  await flushAsync();
  assert.match(failed.elements['pwa-offline-settings'].innerHTML, /<dt>Offline Ready<\/dt>\s*<dd class="[^"]*">Error<\/dd>/);

  const unsupported = createPwaContext({ serviceWorker: { addEventListener: () => {} } });
  assert.match(unsupported.elements['pwa-offline-settings'].innerHTML, /<dt>Offline Ready<\/dt>\s*<dd class="[^"]*">Unavailable<\/dd>/);
});

test('PWA panel reports service-worker cache lookup failures as Error', async () => {
  const serviceWorker = {
    controller: {
      postMessage(message, ports = []) {
        ports[0]?.postMessage({
          type: 'CACHE_STATUS_ERROR',
          requestId: message.requestId,
          message: 'Cache status unavailable.',
        });
      },
    },
    ready: Promise.resolve({ active: true }),
    register: () => Promise.resolve({ active: true, addEventListener: () => {} }),
    addEventListener: () => {},
  };
  const { elements } = createPwaContext({
    serviceWorker,
    caches: {},
  });
  await flushAsync();

  assert.match(elements['pwa-offline-settings'].innerHTML, /<dt>Offline Ready<\/dt>\s*<dd class="[^"]*">Error<\/dd>/);
  assert.match(sw, /CACHE_STATUS_ERROR/);
  assert.match(sw, /APPLICATION_CACHES_REBUILD_FAILED/);
});

test('PWA status handshake uses request IDs, a timeout, and controllerchange retry', () => {
  assert.match(pwaManager, /const requestId = `pwa-status-\$\{Date\.now\(\)\}-\$\{\+\+statusRequestSequence\}`/);
  assert.match(pwaManager, /if \(message\.requestId !== requestId\) return;/);
  assert.match(pwaManager, /setTimeout\(\(\) => \{/);
  assert.match(pwaManager, /STATUS_REQUEST_TIMEOUT_MS/);
  assert.match(pwaManager, /channel\.port1\.onmessage = null;/);
  assert.match(pwaManager, /requestServiceWorkerStatus\(activeRegistration\)/);
  assert.match(pwaManager, /target\.worker\.postMessage\(\{ type: 'GET_CACHE_STATUS', requestId \}, \[channel\.port2\]\)/);
  assert.match(pwaManager, /function trackInstallingWorker\(worker, registration\)/);
  assert.match(pwaManager, /worker\.state === 'redundant'/);
  assert.doesNotMatch(pwaManager, /registration\.update\?\.\(\)/);
});

test('PWA panel displays storage usage without huge browser quota values', async () => {
  const usage = 18.6 * 1024 * 1024;
  const quota = 951394.2 * 1024 * 1024;
  const { elements } = createPwaContext({
    storage: {
      estimate: () => Promise.resolve({ usage, quota }),
      persist: () => Promise.resolve(false),
    },
  });
  await flushAsync();

  assert.match(elements['pwa-offline-settings'].innerHTML, /<dt>Storage Used<\/dt>\s*<dd>18\.6 MB<\/dd>/);
  assert.doesNotMatch(elements['pwa-offline-settings'].innerHTML, /951394\.2 MB| of /);
});

test('service worker reports real cache metadata rather than current render time', () => {
  assert.match(sw, /const CACHE_METADATA_URL = '\.\/__landos-world-cache-metadata\.json'/);
  assert.match(sw, /async function writeCacheMetadata\(eventType\)/);
  assert.match(sw, /await writeCacheMetadata\(eventType\)/);
  assert.match(sw, /const metadata = await readCacheMetadata\(\)/);
  assert.match(sw, /updatedAt: metadata\?\.updatedAt \|\| null/);
  assert.doesNotMatch(sw, /updatedAt: new Date\(\)\.toISOString\(\),\n\s*};\n}/);
});

test('offline-first shell avoids external render-blocking font CSS', () => {
  assert.doesNotMatch(digitalClockCss, /fonts\.googleapis\.com/);
  assert.doesNotMatch(sprintsCss, /fonts\.googleapis\.com/);
  assert.doesNotMatch(roadBikeCss, /fonts\.googleapis\.com/);
});

test('manifest is installable and exposes first-class app shortcuts', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait-primary');
  const shortcutUrls = manifest.shortcuts.map((shortcut) => shortcut.url);
  assert.deepEqual(shortcutUrls, [
    '/landos-world/#/weather',
    '/landos-world/#/digital-clock',
    '/landos-world/#/lee-lees-tracker',
    '/landos-world/#/violet-sprints',
  ]);
});
