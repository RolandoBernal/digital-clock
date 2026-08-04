import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index-digital-clock.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const pwaManager = readFileSync(new URL('../js/pwa-manager.js', import.meta.url), 'utf8');
const digitalClockCss = readFileSync(new URL('../css/digital-clock.css', import.meta.url), 'utf8');
const sprintsCss = readFileSync(new URL('../css/sprints.css', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));

test('service worker precaches the app shell and app modules needed for offline launch', () => {
  [
    './index.html',
    './index-digital-clock.html',
    './manifest.webmanifest',
    './css/digital-clock.css',
    './css/app-themes.css',
    './css/weather-app.css',
    './css/daily-chief-briefing.css',
    './css/levi-diabetes.css',
    './css/sprints.css',
    './js/pwa-manager.js',
    './js/weather-service.js',
    './js/weather-app.js',
    './js/daily-chief-briefing.js',
    './js/levi-diabetes-tracker.js',
    './js/sprints-app.js',
    './fonts/digital-7.ttf',
    './icons/landos-world.svg',
    './icons/weather.svg',
    './icons/digital-clock.svg',
    './icons/lee-lees-tracker.svg',
    './icons/violet-sprints.svg',
    './icons/death-on-notecards.svg',
  ].forEach((asset) => assert.match(sw, new RegExp(asset.replaceAll('.', '\\.'))));
});

test('service worker uses separate versioned caches and strategy-specific runtime handling', () => {
  assert.match(sw, /const SW_VERSION = '2026-08-04-1'/);
  assert.match(sw, /const APP_CACHE = `landos-world-app-\$\{SW_VERSION\}`/);
  assert.match(sw, /const WEATHER_CACHE = `landos-world-weather-\$\{SW_VERSION\}`/);
  assert.match(sw, /const IMAGE_CACHE = `landos-world-images-\$\{SW_VERSION\}`/);
  assert.match(sw, /async function cacheFirst/);
  assert.match(sw, /async function staleWhileRevalidate/);
  assert.match(sw, /async function networkFirst/);
  assert.match(sw, /WEATHER_HOSTS\.has\(url\.hostname\)/);
});

test('application cache cleanup is separated from localStorage user data', () => {
  assert.match(sw, /CLEAR_APPLICATION_CACHES/);
  assert.match(sw, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(sw, /localStorage|indexedDB|deleteDatabase/);
  assert.match(pwaManager, /Cache cleanup never deletes Lee-Lee's Tracker records/);
  assert.doesNotMatch(pwaManager, /localStorage\.clear\(\)/);
});

test('offline, install, update, and settings UI hooks are present and accessible', () => {
  assert.match(html, /id="pwa-network-status" role="status" aria-live="polite"/);
  assert.match(html, /id="pwa-toast" role="status" aria-live="polite"/);
  assert.match(html, /id="pwa-offline-settings" aria-live="polite"/);
  assert.match(pwaManager, /beforeinstallprompt/);
  assert.match(pwaManager, /Update available/);
  assert.match(pwaManager, /data-pwa-action="restart"/);
  assert.match(pwaManager, /navigator\.storage\.persist/);
  assert.match(pwaManager, /navigator\.storage\.estimate/);
  assert.match(digitalClockCss, /\.pwa_network_status/);
  assert.match(digitalClockCss, /\.pwa_offline_panel/);
});

test('offline-first shell avoids external render-blocking font CSS', () => {
  assert.doesNotMatch(digitalClockCss, /fonts\.googleapis\.com/);
  assert.doesNotMatch(sprintsCss, /fonts\.googleapis\.com/);
});

test('manifest is installable and exposes first-class app shortcuts', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait-primary');
  const shortcutUrls = manifest.shortcuts.map((shortcut) => shortcut.url);
  assert.deepEqual(shortcutUrls, [
    '/landos-world/index-digital-clock.html#/daily-chief-briefing',
    '/landos-world/index-digital-clock.html#/weather',
    '/landos-world/index-digital-clock.html#/digital-clock',
    '/landos-world/index-digital-clock.html#/lee-lees-tracker',
    '/landos-world/index-digital-clock.html#/violet-sprints',
  ]);
});
