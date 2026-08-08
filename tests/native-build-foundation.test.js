import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const rootUrl = new URL('../', import.meta.url);
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pwaManager = readFileSync(new URL('../js/pwa-manager.js', import.meta.url), 'utf8');
const syncSource = readFileSync(new URL('../js/lee-lees-tracker-sync.js', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../js/runtime.js', import.meta.url), 'utf8');

function loadRuntime(overrides = {}) {
  const context = {
    document: { baseURI: 'http://localhost/' },
    navigator: { serviceWorker: {} },
    URL,
    ...overrides,
  };
  context.globalThis = context;
  runInNewContext(runtimeSource, context);
  return context.LandosRuntime;
}

test('runtime utility exposes web/native detection without requiring Capacitor', () => {
  assert.match(runtimeSource, /globalThis\.LandosRuntime = Object\.freeze/);
  assert.match(runtimeSource, /function isNative\(\)/);
  assert.match(runtimeSource, /function isWeb\(\)/);
  assert.match(runtimeSource, /function shouldRegisterServiceWorker\(\)/);
  assert.match(runtimeSource, /LANDOS_RUNTIME_MODE/);
  assert.match(runtimeSource, /globalThis\.Capacitor/);
  assert.match(html, /js\/runtime\.js/);
});

test('runtime service-worker detection honors explicit native build mode', () => {
  assert.equal(loadRuntime().shouldRegisterServiceWorker(), true);
  assert.equal(loadRuntime({ LANDOS_RUNTIME_MODE: 'native' }).getMode(), 'native');
  assert.equal(loadRuntime({ LANDOS_RUNTIME_MODE: 'native' }).shouldRegisterServiceWorker(), false);
  assert.equal(loadRuntime({ LANDOS_RUNTIME_MODE: 'web' }).shouldRegisterServiceWorker(), true);
  assert.equal(loadRuntime({ Capacitor: { platform: 'ios' } }).shouldRegisterServiceWorker(), false);
});

test('service worker registration is guarded for future native runtimes', () => {
  assert.match(pwaManager, /LandosRuntime\?\.shouldRegisterServiceWorker/);
  assert.match(pwaManager, /navigator\.serviceWorker\.register\(SW_PATH\)/);
});

test('Supabase client is loaded from the local application bundle', () => {
  assert.match(html, /vendor\/supabase\/supabase\.js/);
  assert.equal(existsSync(new URL('../vendor/supabase/supabase.js', import.meta.url)), true);
  assert.doesNotMatch(syncSource, /cdn\.jsdelivr\.net/);
  assert.doesNotMatch(syncSource, /SUPABASE_CDN_URL/);
});

test('static build creates web and native runtime outputs with local assets', async () => {
  await rm(new URL('../dist', import.meta.url), { recursive: true, force: true });
  execFileSync(process.execPath, ['scripts/build-static.mjs'], {
    cwd: fileURLToPath(rootUrl),
    stdio: 'pipe',
  });

  [
    'dist/web/index.html',
    'dist/web/js/runtime.js',
    'dist/web/vendor/supabase/supabase.js',
    'dist/web/icons/weather.png',
    'dist/web/fonts/digital-7.ttf',
    'dist/native/index.html',
    'dist/native/js/runtime.js',
    'dist/native/vendor/supabase/supabase.js',
    'dist/native/icons/lee-lees-tracker.png',
    'dist/native/BUILD_INFO.json',
  ].forEach((relativePath) => {
    assert.equal(existsSync(new URL(`../${relativePath}`, import.meta.url)), true, `${relativePath} should exist`);
  });

  const webManifest = JSON.parse(readFileSync(new URL('../dist/web/manifest.webmanifest', import.meta.url), 'utf8'));
  const nativeManifest = JSON.parse(readFileSync(new URL('../dist/native/manifest.webmanifest', import.meta.url), 'utf8'));
  const webIndex = readFileSync(new URL('../dist/web/index.html', import.meta.url), 'utf8');
  const nativeIndex = readFileSync(new URL('../dist/native/index.html', import.meta.url), 'utf8');
  assert.equal(webManifest.start_url, '/landos-world/');
  assert.equal(nativeManifest.start_url, './');
  assert.equal(nativeManifest.scope, './');
  assert.doesNotMatch(webIndex, /LANDOS_RUNTIME_MODE = 'native'/);
  assert.match(nativeIndex, /LANDOS_RUNTIME_MODE = 'native'/);
  assert.ok(
    nativeIndex.indexOf("LANDOS_RUNTIME_MODE = 'native'") < nativeIndex.indexOf('js/runtime.js'),
    'native runtime mode should be declared before runtime.js loads',
  );
  assert.deepEqual(nativeManifest.icons.map((icon) => icon.src), [
    'icons/landos-world-192-v2.png',
    'icons/landos-world-512-v2.png',
    'icons/landos-world-maskable-512-v2.png',
  ]);
  assert.deepEqual(nativeManifest.shortcuts.map((shortcut) => shortcut.url), [
    './#/weather',
    './#/digital-clock',
    './#/lee-lees-tracker',
    './#/violet-sprints',
  ]);
});
