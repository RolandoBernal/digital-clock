import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const entryHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const legacyHtml = readFileSync(new URL('../index-digital-clock.html', import.meta.url), 'utf8');
const digitalClockHtml = readFileSync(new URL('../digital-clock.html', import.meta.url), 'utf8');

test('PWA shell is branded as Lando World at the GitHub Pages landos-world path', () => {
  assert.equal(manifest.name, "Lando's World");
  assert.equal(manifest.short_name, 'Lando');
  assert.equal(manifest.id, '/landos-world/');
  assert.equal(manifest.start_url, '/landos-world/');
  assert.equal(manifest.scope, '/landos-world/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait-primary');
  assert.equal(manifest.background_color, '#000000');
  assert.equal(manifest.theme_color, '#000000');
  assert.match(html, /https:\/\/rolandobernal\.github\.io\/landos-world\//);
  assert.doesNotMatch(html, /clock-favicon\.svg/);
});

test('PWA shell references dedicated Lando World install icons', () => {
  const iconSources = manifest.icons.map((icon) => icon.src);
  assert.deepEqual(iconSources, [
    '/landos-world/icons/landos-world-192-v2.png',
    '/landos-world/icons/landos-world-512-v2.png',
    '/landos-world/icons/landos-world-maskable-512-v2.png',
  ]);
  assert.match(html, /apple-touch-icon-landos-world-v2\.png/);
  [
    '../favicon-landos-world.svg',
    '../apple-touch-icon-landos-world-v2.png',
    '../icons/landos-world.svg',
    '../icons/landos-world-192-v2.png',
    '../icons/landos-world-512-v2.png',
    '../icons/landos-world-maskable-512-v2.png',
  ].forEach((path) => {
    assert.equal(existsSync(new URL(path, import.meta.url)), true, `${path} should exist`);
  });
});

test('PWA shell registers an offline-first service worker through the PWA manager', () => {
  assert.match(html, /js\/pwa-manager\.js/);
  assert.match(readFileSync(new URL('../js/pwa-manager.js', import.meta.url), 'utf8'), /serviceWorker\.register\(SW_PATH\)/);
  assert.equal(existsSync(new URL('../service-worker.js', import.meta.url)), true);
});

test('GitHub Pages entrypoint is the Lando World app shell', () => {
  assert.match(entryHtml, /id="lando-launcher"/);
  assert.doesNotMatch(entryHtml, /index-digital-clock\.html/);
});

test('landing launcher omits Daily Chief Briefing and starts with Weather', () => {
  const appCardsStart = entryHtml.indexOf('const APP_CARDS = [');
  const appCardsEnd = entryHtml.indexOf('const WEATHER_CONFIG = [');
  const appCardsSource = entryHtml.slice(appCardsStart, appCardsEnd);
  assert.doesNotMatch(appCardsSource, /id: 'daily-chief-briefing'/);
  assert.match(appCardsSource, /id: 'weather'/);
  assert.ok(appCardsSource.indexOf("id: 'weather'") < appCardsSource.indexOf("id: 'digital-clock'"));
});

test('legacy and renamed Digital Clock URLs redirect to the root hash router', () => {
  [legacyHtml, digitalClockHtml].forEach((redirectHtml) => {
    assert.match(redirectHtml, /new URL\('\.\/', currentUrl\)/);
    assert.match(redirectHtml, /targetUrl\.search = currentUrl\.search/);
    assert.match(redirectHtml, /targetUrl\.hash = currentUrl\.hash \|\| '#\/digital-clock'/);
    assert.match(redirectHtml, /window\.location\.replace\(targetUrl\.href\)/);
  });
});
