import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index-digital-clock.html', import.meta.url), 'utf8');
const entryHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('PWA shell is branded as Lando World at the GitHub Pages landos-world path', () => {
  assert.equal(manifest.name, "Lando's World");
  assert.equal(manifest.short_name, "Lando's World");
  assert.equal(manifest.id, '/landos-world/');
  assert.equal(manifest.start_url, '/landos-world/index-digital-clock.html');
  assert.equal(manifest.scope, '/landos-world/');
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

test('PWA shell does not rely on an active service worker cache name', () => {
  assert.doesNotMatch(html, /serviceWorker\.register/);
  assert.doesNotMatch(entryHtml, /serviceWorker\.register/);
});

test('GitHub Pages entrypoint redirect preserves URL state and avoids loops', () => {
  assert.match(entryHtml, /targetUrl\.search = currentUrl\.search/);
  assert.match(entryHtml, /targetUrl\.hash = currentUrl\.hash/);
  assert.match(entryHtml, /currentUrl\.pathname !== targetUrl\.pathname/);
  assert.match(entryHtml, /window\.location\.replace\(targetUrl\.href\)/);
});
