(() => {
  const INSTALL_DISMISSED_KEY = 'landos_world_install_dismissed_v1';
  const STORAGE_PERSIST_REQUESTED_KEY = 'landos_world_storage_persist_requested_v1';
  const SW_PATH = './service-worker.js';
  const STATUS_REQUEST_TIMEOUT_MS = 4000;

  let deferredInstallPrompt = null;
  let waitingWorker = null;
  let cacheStatus = null;
  let lastCacheUpdate = null;
  let offlineReadiness = 'preparing';
  let storageEstimate = null;
  let isInstalled = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let restartRequested = false;
  let activeRegistration = null;
  let statusRequestSequence = 0;

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
    if (bytes < 1024 * 1024 * 1024) return `${formatNumber(bytes / (1024 * 1024))} MB`;
    return `${formatNumber(bytes / (1024 * 1024 * 1024))} GB`;
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return '0';
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function formatTime(value) {
    if (!value) return 'Not available';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not available';
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  function getConnectionLabel() {
    return navigator.onLine === false ? 'Offline' : 'Online';
  }

  function getOfflineReadinessLabel() {
    if (offlineReadiness === 'ready') return 'Ready';
    if (offlineReadiness === 'unavailable') return 'Unavailable';
    if (offlineReadiness === 'error') return 'Error';
    if (offlineReadiness === 'ready-after-refresh') return 'Ready after refresh';
    return 'Preparing';
  }

  function getStorageUsageLabel() {
    if (!storageEstimate || !Number.isFinite(storageEstimate.usage)) return 'Not available';
    return formatBytes(storageEstimate.usage);
  }

  function getApplicationVersionLabel() {
    return cacheStatus?.version || 'Not available';
  }

  function getStatusClass(value) {
    if (value === 'Online' || value === 'Ready' || value === 'Yes') return 'pwa_status_value pwa_status_value--success';
    if (value === 'Offline' || value === 'Preparing' || value === 'Ready after refresh') return 'pwa_status_value pwa_status_value--warning';
    if (value === 'Error') return 'pwa_status_value pwa_status_value--error';
    return 'pwa_status_value';
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
    el.hidden = online && offlineReadiness === 'ready';
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
    const connectionLabel = getConnectionLabel();
    const installedLabel = isInstalled ? 'Yes' : 'No';
    const offlineReadinessLabel = getOfflineReadinessLabel();
    root.innerHTML = `
      <section class="pwa_offline_panel" id="pwa-offline-panel" aria-labelledby="pwa-offline-title">
        <h2 id="pwa-offline-title">Application Status</h2>
        <dl>
          <div>
            <dt>Application Version</dt>
            <dd>${getApplicationVersionLabel()}</dd>
          </div>
          <div>
            <dt>Connection</dt>
            <dd class="${getStatusClass(connectionLabel)}">${connectionLabel}</dd>
          </div>
          <div>
            <dt>Application Installed</dt>
            <dd class="${getStatusClass(installedLabel)}">${installedLabel}</dd>
          </div>
          <div>
            <dt>Offline Ready</dt>
            <dd class="${getStatusClass(offlineReadinessLabel)}">${offlineReadinessLabel}</dd>
          </div>
          <div>
            <dt>Last Cache Update</dt>
            <dd>${formatTime(lastCacheUpdate || cacheStatus?.updatedAt)}</dd>
          </div>
          <div>
            <dt>Storage Used</dt>
            <dd>${getStorageUsageLabel()}</dd>
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
    if (!navigator.storage?.estimate) {
      storageEstimate = null;
      updateUi();
      return;
    }
    try {
      storageEstimate = await navigator.storage.estimate();
      updateUi();
    } catch (error) {
      storageEstimate = null;
      console.warn('Storage estimate is unavailable.', error);
      updateUi();
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

  function getStatusTarget(registration = activeRegistration) {
    if (registration?.waiting) {
      return { worker: registration.waiting, requiresRefresh: true, role: 'waiting' };
    }
    if (navigator.serviceWorker?.controller) {
      return { worker: navigator.serviceWorker.controller, requiresRefresh: false, role: 'controller' };
    }
    if (registration?.active) {
      return { worker: registration.active, requiresRefresh: true, role: 'active' };
    }
    return null;
  }

  function applyCacheStatus(status, target) {
    cacheStatus = status;
    lastCacheUpdate = status?.updatedAt || lastCacheUpdate;
    if (status?.appCacheReady) {
      offlineReadiness = target?.requiresRefresh ? 'ready-after-refresh' : 'ready';
    } else {
      offlineReadiness = 'error';
    }
    updateUi();
  }

  function requestServiceWorkerStatus(registration = activeRegistration) {
    if (!('serviceWorker' in navigator) || !('caches' in window)) {
      offlineReadiness = 'unavailable';
      updateUi();
      return Promise.resolve(null);
    }
    if (typeof MessageChannel !== 'function') {
      offlineReadiness = 'error';
      console.warn('Service worker status request failed: MessageChannel is unavailable.');
      updateUi();
      return Promise.resolve(null);
    }
    const target = getStatusTarget(registration);
    if (!target?.worker?.postMessage) {
      offlineReadiness = registration?.installing ? 'preparing' : 'error';
      updateUi();
      return Promise.resolve(null);
    }

    const requestId = `pwa-status-${Date.now()}-${++statusRequestSequence}`;
    const channel = new MessageChannel();
    return new Promise((resolve) => {
      const cleanup = () => {
        clearTimeout(timeoutId);
        channel.port1.onmessage = null;
        channel.port1.close?.();
      };
      const timeoutId = setTimeout(() => {
        cleanup();
        offlineReadiness = 'error';
        console.warn('Service worker status request timed out.', {
          role: target.role,
          scope: registration?.scope || null,
          controller: navigator.serviceWorker?.controller?.scriptURL || null,
        });
        updateUi();
        resolve(null);
      }, STATUS_REQUEST_TIMEOUT_MS);

      channel.port1.onmessage = (event) => {
        const message = event.data || {};
        if (message.requestId !== requestId) return;
        cleanup();
        if (message.type === 'CACHE_STATUS') {
          applyCacheStatus(message.status, target);
          resolve(message.status);
          return;
        }
        offlineReadiness = 'error';
        console.warn('Service worker status request failed.', message.message || message.type || 'Unknown response');
        updateUi();
        resolve(null);
      };

      try {
        target.worker.postMessage({ type: 'GET_CACHE_STATUS', requestId }, [channel.port2]);
      } catch (error) {
        cleanup();
        offlineReadiness = 'error';
        console.warn('Service worker status request could not be sent.', error);
        updateUi();
        resolve(null);
      }
    });
  }

  function withTimeout(promise, timeoutMs, message) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
  }

  function trackInstallingWorker(worker, registration) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        if (navigator.serviceWorker.controller) {
          waitingWorker = worker;
        } else {
          offlineReadiness = 'ready-after-refresh';
        }
        updateUi();
        requestServiceWorkerStatus(registration);
      }
      if (worker.state === 'activated') {
        requestServiceWorkerStatus(registration);
      }
      if (worker.state === 'redundant') {
        offlineReadiness = 'error';
        console.warn('Service worker installation failed or was replaced before activation.', {
          scope: registration?.scope || null,
          scriptURL: worker.scriptURL || null,
        });
        updateUi();
      }
    });
  }

  async function registerServiceWorker() {
    const shouldRegister = globalThis.LandosRuntime?.shouldRegisterServiceWorker
      ? globalThis.LandosRuntime.shouldRegisterServiceWorker()
      : 'serviceWorker' in navigator;
    if (!shouldRegister) {
      offlineReadiness = 'unavailable';
      updateUi();
      return;
    }
    if (!('caches' in window)) {
      offlineReadiness = 'unavailable';
      updateUi();
      return;
    }
    try {
      const registration = await withTimeout(
        navigator.serviceWorker.register(SW_PATH),
        STATUS_REQUEST_TIMEOUT_MS,
        'Service worker registration timed out.',
      );
      activeRegistration = registration;
      updateUi();
      withTimeout(
        navigator.serviceWorker.ready,
        STATUS_REQUEST_TIMEOUT_MS,
        'Service worker ready timed out.',
      )
        .then((readyRegistration) => {
          activeRegistration = readyRegistration;
          requestServiceWorkerStatus(readyRegistration);
          updateUi();
        })
        .catch((error) => {
          offlineReadiness = 'error';
          console.warn('Service worker readiness failed.', error);
          updateUi();
        });
      requestServiceWorkerStatus(registration);

      if (registration.waiting) {
        waitingWorker = registration.waiting;
        updateUi();
      }

      trackInstallingWorker(registration.installing, registration);
      registration.addEventListener('updatefound', () => {
        trackInstallingWorker(registration.installing, registration);
      });
    } catch (error) {
      offlineReadiness = 'error';
      console.warn('Service worker registration failed.', error);
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
      offlineReadiness = 'preparing';
      cacheStatus = null;
      lastCacheUpdate = null;
      updateUi();
      controller.postMessage({ type: 'CLEAR_APPLICATION_CACHES' });
    } else if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('landos-world-')).map((key) => caches.delete(key)));
      offlineReadiness = 'preparing';
      cacheStatus = null;
      lastCacheUpdate = null;
      updateUi();
      registerServiceWorker();
    }
    refreshStorageEstimate();
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
      requestServiceWorkerStatus(activeRegistration);
      updateUi();
    });
    navigator.serviceWorker?.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'CACHE_STATUS') {
        applyCacheStatus(message.status, { requiresRefresh: false });
      }
      if (message.type === 'CACHE_STATUS_ERROR') {
        offlineReadiness = 'error';
        console.warn('Application cache status is unavailable.', message.message);
        updateUi();
      }
      if (message.type === 'APPLICATION_CACHES_CLEARED') {
        offlineReadiness = 'preparing';
        cacheStatus = null;
        lastCacheUpdate = null;
        updateUi();
        refreshStorageEstimate();
      }
      if (message.type === 'APPLICATION_CACHES_REBUILT') {
        applyCacheStatus(message.status, { requiresRefresh: false });
        refreshStorageEstimate();
      }
      if (message.type === 'APPLICATION_CACHES_REBUILD_FAILED') {
        offlineReadiness = 'error';
        console.warn('Application cache rebuild failed.', message.message);
        updateUi();
        refreshStorageEstimate();
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
      offlineReady: offlineReadiness === 'ready',
      offlineReadiness,
      isInstalled,
      cacheStatus,
      storageEstimate,
      hasDeferredInstallPrompt: Boolean(deferredInstallPrompt),
      hasWaitingWorker: Boolean(waitingWorker),
    }),
  };
})();
