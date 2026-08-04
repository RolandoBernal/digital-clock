const SW_VERSION = '2026-08-04-1';
const APP_CACHE = `landos-world-app-${SW_VERSION}`;
const RUNTIME_CACHE = `landos-world-runtime-${SW_VERSION}`;
const WEATHER_CACHE = `landos-world-weather-${SW_VERSION}`;
const IMAGE_CACHE = `landos-world-images-${SW_VERSION}`;
const FONT_CACHE = `landos-world-fonts-${SW_VERSION}`;
const CACHE_PREFIX = 'landos-world-';

const PRECACHE_URLS = [
  './',
  './index.html',
  './index-digital-clock.html',
  './manifest.webmanifest',
  './favicon-landos-world.svg',
  './favicon.svg',
  './clock-favicon.svg',
  './apple-touch-icon-landos-world-v2.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './css/app-themes.css',
  './css/digital-clock.css',
  './css/weather-app.css',
  './css/daily-chief-briefing.css',
  './css/levi-diabetes.css',
  './css/sprints.css',
  './js/pwa-manager.js',
  './js/weather-service.js',
  './js/weather-app.js',
  './js/daily-chief-briefing.js',
  './js/lee-lees-tracker-config.js',
  './js/lee-lees-tracker-sync.js',
  './js/levi-diabetes-tracker.js',
  './js/sprints-app.js',
  './fonts/digital-7.ttf',
  './icons/landos-world.svg',
  './icons/landos-world-192-v2.png',
  './icons/landos-world-512-v2.png',
  './icons/landos-world-maskable-512-v2.png',
  './icons/weather.svg',
  './icons/weather.png',
  './icons/digital-clock.svg',
  './icons/digital-clock.png',
  './icons/lee-lees-tracker.svg',
  './icons/lee-lees-tracker.png',
  './icons/violet-sprints.svg',
  './icons/violet-sprints.png',
  './icons/death-on-notecards.svg',
  './icons/death-on-notecards.png',
  './icons/daily-chief-briefing.svg',
  './icons/daily-chief-briefing.png',
];

const WEATHER_HOSTS = new Set([
  'api.open-meteo.com',
  'geocoding-api.open-meteo.com',
]);

function stripVersionSearch(request) {
  const url = new URL(request.url);
  url.search = '';
  return url.href;
}

async function putIfOk(cacheName, request, response) {
  if (!response || (!response.ok && response.type !== 'opaque')) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true })
    || await cache.match(stripVersionSearch(request));
  if (cached) return cached;
  const response = await fetch(request);
  await putIfOk(cacheName, request, response);
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: false });
  const refresh = fetch(request)
    .then(async (response) => {
      await putIfOk(cacheName, request, response);
      return response;
    })
    .catch(() => null);
  return cached || await refresh || Response.error();
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    await putIfOk(cacheName, request, response);
    return response;
  } catch {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw new Error('No cached response available.');
  }
}

async function appShellFallback() {
  const cache = await caches.open(APP_CACHE);
  return await cache.match('./index-digital-clock.html')
    || await cache.match('./index.html')
    || Response.error();
}

async function getCacheStatus() {
  const keys = await caches.keys();
  const ownedKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
  let cachedRequestCount = 0;
  await Promise.all(ownedKeys.map(async (key) => {
    cachedRequestCount += (await caches.open(key).then((cache) => cache.keys())).length;
  }));
  return {
    version: SW_VERSION,
    cacheNames: ownedKeys,
    cachedRequestCount,
    updatedAt: new Date().toISOString(),
  };
}

async function clearApplicationCaches() {
  const keys = await caches.keys();
  const deleted = await Promise.all(
    keys
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .map((key) => caches.delete(key)),
  );
  return deleted.filter(Boolean).length;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.registration.update()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX))
          .filter((key) => ![APP_CACHE, RUNTIME_CACHE, WEATHER_CACHE, IMAGE_CACHE, FONT_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (WEATHER_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, WEATHER_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    if (url.pathname.includes('/death-on-notecards/')) {
      event.respondWith(networkFirst(request, RUNTIME_CACHE).catch(appShellFallback));
      return;
    }
    event.respondWith(cacheFirst(request, APP_CACHE).catch(appShellFallback));
    return;
  }

  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  if (request.destination === 'font') {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  if (['style', 'script', 'manifest'].includes(request.destination) || url.pathname.endsWith('.svg')) {
    event.respondWith(cacheFirst(request, APP_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
  }
});

self.addEventListener('message', (event) => {
  const message = event.data || {};
  if (message.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (message.type === 'GET_CACHE_STATUS') {
    event.waitUntil(
      getCacheStatus().then((status) => {
        event.source?.postMessage({ type: 'CACHE_STATUS', status });
      }),
    );
    return;
  }
  if (message.type === 'CLEAR_APPLICATION_CACHES') {
    event.waitUntil(
      clearApplicationCaches().then((deletedCount) => {
        event.source?.postMessage({ type: 'APPLICATION_CACHES_CLEARED', deletedCount });
      }),
    );
  }
});
