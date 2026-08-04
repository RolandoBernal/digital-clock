(() => {
  const INSTALL_DISMISSED_KEY = 'landos_world_install_dismissed_v1';
  const STORAGE_PERSIST_REQUESTED_KEY = 'landos_world_storage_persist_requested_v1';
  const SW_PATH = './service-worker.js';

  let deferredInstallPrompt = null;
  let waitingWorker = null;
  let cacheStatus = null;
  let lastCacheUpdate = '';
  let offlineReady = false;
  let storageEstimate = null;
  let isInstalled = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let restartRequested = false;

  function getStatusEl() {
    return document.getElementById('pwa-network-status');
  }

  function getToastEl() {
    return document.getElementById('pwa-toast');
  }

  function getSettingsRoot() {
    return document.getElementById('pwa-offline-settings');
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return 'Not available';
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatTime(value) {
    if (!value) return 'Not yet';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not yet';
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  function wasInstallDismissed() {
    try {
      return localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function setInstallDismissed() {
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
    } catch {
      /* storage unavailable */
    }
  }

  function renderNetworkStatus() {
    const el = getStatusEl();
    if (!el) return;
    const online = navigator.onLine !== false;
    el.hidden = online && offlineReady;
    el.classList.toggle('is-offline', !online);
    el.classList.toggle('is-online', online);
    el.textContent = online ? 'Online' : 'Offline - using cached data';
    el.setAttribute('aria-label', online ? "Lando's World is online." : "Lando's World is offline and using cached data.");
  }

  function renderToast() {
    const el = getToastEl();
    if (!el) return;
    if (waitingWorker) {
      el.hidden = false;
      el.innerHTML = `
        <span>Update available</span>
        <button type="button" data-pwa-action="restart">Restart</button>
      `;
      return;
    }
    if (deferredInstallPrompt && !isInstalled && !wasInstallDismissed()) {
      el.hidden = false;
      el.innerHTML = `
        <span>Install Lando's World</span>
        <button type="button" data-pwa-action="install">Install</button>
        <button type="button" data-pwa-action="dismiss-install" aria-label="Dismiss install prompt">Not now</button>
      `;
      return;
    }
    el.hidden = true;
    el.textContent = '';
  }

  function renderSettings() {
    const root = getSettingsRoot();
    if (!root) return;
    root.innerHTML = `
      <section class="pwa_offline_panel" aria-labelledby="pwa-offline-title">
        <h2 id="pwa-offline-title">Offline</h2>
        <dl>
          <div>
            <dt>Application Installed</dt>
            <dd>${isInstalled ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt>Offline Ready</dt>
            <dd>${offlineReady ? 'Yes' : 'Preparing'}</dd>
          </div>
          <div>
            <dt>Last Cache Update</dt>
            <dd>${formatTime(lastCacheUpdate || cacheStatus?.updatedAt)}</dd>
          </div>
          <div>
            <dt>Storage Used</dt>
            <dd>${storageEstimate ? `${formatBytes(storageEstimate.usage)} of ${formatBytes(storageEstimate.quota)}` : 'Not available'}</dd>
          </div>
        </dl>
        <button type="button" class="pwa_cache_button" data-pwa-action="clear-cache">Clear Application Cache</button>
        <p>Cache cleanup never deletes Lee-Lee's Tracker records or other local app data.</p>
      </section>
    `;
  }

  function updateUi() {
    renderNetworkStatus();
    renderToast();
    renderSettings();
  }

  async function refreshStorageEstimate() {
    if (!navigator.storage?.estimate) return;
    try {
      storageEstimate = await navigator.storage.estimate();
      updateUi();
    } catch {
      /* unavailable */
    }
  }

  async function requestPersistentStorageOnce() {
    if (!navigator.storage?.persist) return;
    try {
      if (localStorage.getItem(STORAGE_PERSIST_REQUESTED_KEY) === 'true') return;
      localStorage.setItem(STORAGE_PERSIST_REQUESTED_KEY, 'true');
      await navigator.storage.persist();
    } catch {
      /* persistence is optional */
    }
  }

  function askServiceWorkerForStatus() {
    const controller = navigator.serviceWorker?.controller;
    if (!controller) return;
    controller.postMessage({ type: 'GET_CACHE_STATUS' });
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      updateUi();
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register(SW_PATH);
      offlineReady = Boolean(navigator.serviceWorker.controller || registration.active);
      lastCacheUpdate = new Date().toISOString();
      updateUi();
      askServiceWorkerForStatus();

      if (registration.waiting) {
        waitingWorker = registration.waiting;
        updateUi();
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') {
            offlineReady = true;
            lastCacheUpdate = new Date().toISOString();
            if (navigator.serviceWorker.controller) {
              waitingWorker = installing;
            }
            updateUi();
            askServiceWorkerForStatus();
          }
        });
      });
    } catch {
      offlineReady = false;
      updateUi();
    }
  }

  async function clearApplicationCache() {
    if (navigator.onLine === false) {
      alert('Reconnect before clearing cached app files.');
      return;
    }
    if (!confirm("Clear cached app files? Lee-Lee's Tracker records and local data will not be deleted.")) return;
    const controller = navigator.serviceWorker?.controller;
    if (controller) {
      controller.postMessage({ type: 'CLEAR_APPLICATION_CACHES' });
    } else if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('landos-world-')).map((key) => caches.delete(key)));
      offlineReady = false;
      lastCacheUpdate = '';
      updateUi();
    }
  }

  async function handleInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    isInstalled = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    updateUi();
  }

  function handleClick(event) {
    const action = event.target.closest('[data-pwa-action]')?.dataset.pwaAction;
    if (!action) return;
    if (action === 'restart') {
      restartRequested = true;
      waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    if (action === 'install') {
      handleInstall();
      return;
    }
    if (action === 'dismiss-install') {
      deferredInstallPrompt = null;
      setInstallDismissed();
      updateUi();
      return;
    }
    if (action === 'clear-cache') {
      clearApplicationCache();
    }
  }

  function initEvents() {
    window.addEventListener('online', () => {
      updateUi();
      window.dispatchEvent(new CustomEvent('lando:online'));
      window.LandosWeatherApp?.loadWeather?.();
      window.DailyChiefBriefing?.loadWeatherForBriefing?.();
    });
    window.addEventListener('offline', updateUi);
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      updateUi();
    });
    window.addEventListener('appinstalled', () => {
      isInstalled = true;
      deferredInstallPrompt = null;
      updateUi();
    });
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      if (restartRequested) {
        window.location.reload();
        return;
      }
      offlineReady = true;
      askServiceWorkerForStatus();
      updateUi();
    });
    navigator.serviceWorker?.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'CACHE_STATUS') {
        cacheStatus = message.status;
        offlineReady = Boolean(message.status?.cachedRequestCount);
        lastCacheUpdate = message.status?.updatedAt || lastCacheUpdate;
        updateUi();
      }
      if (message.type === 'APPLICATION_CACHES_CLEARED') {
        offlineReady = false;
        cacheStatus = null;
        lastCacheUpdate = '';
        updateUi();
        setTimeout(() => window.location.reload(), 250);
      }
    });
    document.addEventListener('click', handleClick);
  }

  function init() {
    initEvents();
    updateUi();
    registerServiceWorker();
    refreshStorageEstimate();
    requestPersistentStorageOnce();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.LandosPWA = {
    registerServiceWorker,
    clearApplicationCache,
    getState: () => ({
      offlineReady,
      isInstalled,
      cacheStatus,
      storageEstimate,
      hasDeferredInstallPrompt: Boolean(deferredInstallPrompt),
      hasWaitingWorker: Boolean(waitingWorker),
    }),
  };
})();
