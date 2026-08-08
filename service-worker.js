const SW_VERSION = '2026-08-07-1';
const APP_CACHE = `landos-world-app-${SW_VERSION}`;
const RUNTIME_CACHE = `landos-world-runtime-${SW_VERSION}`;
const WEATHER_CACHE = `landos-world-weather-${SW_VERSION}`;
const IMAGE_CACHE = `landos-world-images-${SW_VERSION}`;
const FONT_CACHE = `landos-world-fonts-${SW_VERSION}`;
const CACHE_PREFIX = 'landos-world-';
const CACHE_METADATA_URL = './__landos-world-cache-metadata.json';

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
  './css/road-bike-checklist.css',
  './js/runtime.js',
  './js/pwa-manager.js',
  './js/weather-service.js',
  './js/weather-app.js',
  './js/daily-chief-briefing.js',
  './js/lee-lees-tracker-config.js',
  './js/lee-lees-tracker-sync.js',
  './js/levi-diabetes-tracker.js',
  './js/sprints-app.js',
  './js/road-bike-checklist.js',
  './vendor/supabase/supabase.js',
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
  './icons/road-bike-checklist.svg',
  './icons/road-bike-checklist.png',
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
  return await cache.match('./index.html')
    || Response.error();
}

function metadataRequest() {
  return new Request(CACHE_METADATA_URL);
}

async function writeCacheMetadata(eventType) {
  const cache = await caches.open(APP_CACHE);
  const metadata = {
    version: SW_VERSION,
    eventType,
    updatedAt: new Date().toISOString(),
  };
  await cache.put(metadataRequest(), new Response(JSON.stringify(metadata), {
    headers: { 'Content-Type': 'application/json' },
  }));
  return metadata;
}

async function readCacheMetadata() {
  const cache = await caches.open(APP_CACHE);
  const response = await cache.match(metadataRequest());
  if (!response) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function precacheApplicationShell(eventType) {
  const cache = await caches.open(APP_CACHE);
  await Promise.all(PRECACHE_URLS.map(async (url) => {
    const request = new Request(url, { cache: 'reload' });
    let response;
    try {
      response = await fetch(request);
    } catch (error) {
      throw new Error(`Failed to cache ${request.url}: ${error?.message || 'Network error'}`);
    }
    if (!response || (!response.ok && response.type !== 'opaque')) {
      throw new Error(`Failed to cache ${request.url}: HTTP ${response?.status || 'unknown'}`);
    }
    await cache.put(request, response);
  }));
  return await writeCacheMetadata(eventType);
}

async function isApplicationShellCached() {
  const cache = await caches.open(APP_CACHE);
  const cachedUrls = new Set((await cache.keys()).map((request) => request.url));
  return PRECACHE_URLS.every((url) => cachedUrls.has(new URL(url, self.location.href).href));
}

async function getCacheStatus() {
  const keys = await caches.keys();
  const ownedKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
  let cachedRequestCount = 0;
  await Promise.all(ownedKeys.map(async (key) => {
    cachedRequestCount += (await caches.open(key).then((cache) => cache.keys())).length;
  }));
  const metadata = await readCacheMetadata();
  return {
    version: SW_VERSION,
    cacheNames: ownedKeys,
    cachedRequestCount,
    appCacheName: APP_CACHE,
    appCacheReady: ownedKeys.includes(APP_CACHE) && await isApplicationShellCached(),
    updatedAt: metadata?.updatedAt || null,
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
    precacheApplicationShell('install')
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
  const respond = (payload) => {
    const response = { ...payload, requestId: message.requestId || null };
    if (event.ports?.[0]) {
      event.ports[0].postMessage(response);
      return;
    }
    event.source?.postMessage(response);
  };
  if (message.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (message.type === 'GET_CACHE_STATUS') {
    event.waitUntil(
      getCacheStatus()
        .then((status) => {
          respond({ type: 'CACHE_STATUS', status });
        })
        .catch((error) => {
          respond({ type: 'CACHE_STATUS_ERROR', message: error?.message || 'Cache status unavailable.' });
        }),
    );
    return;
  }
  if (message.type === 'CLEAR_APPLICATION_CACHES') {
    event.waitUntil(
      clearApplicationCaches()
        .then(async (deletedCount) => {
          respond({ type: 'APPLICATION_CACHES_CLEARED', deletedCount });
          await precacheApplicationShell('rebuild');
          const status = await getCacheStatus();
          respond({ type: 'APPLICATION_CACHES_REBUILT', status });
        })
        .catch((error) => {
          respond({ type: 'APPLICATION_CACHES_REBUILD_FAILED', message: error?.message || 'Application cache rebuild failed.' });
        }),
    );
  }
});
