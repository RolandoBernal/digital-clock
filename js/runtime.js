(() => {
  const explicitMode = String(globalThis.LANDOS_RUNTIME_MODE || '').trim().toLowerCase();

  function hasCapacitorBridge() {
    const bridge = globalThis.Capacitor;
    if (!bridge) return false;
    if (typeof bridge.isNativePlatform === 'function') return bridge.isNativePlatform() === true;
    return Boolean(bridge.platform && bridge.platform !== 'web');
  }

  function getMode() {
    if (['native', 'capacitor', 'ios', 'android'].includes(explicitMode)) return 'native';
    if (explicitMode === 'web') return 'web';
    return hasCapacitorBridge() ? 'native' : 'web';
  }

  function isNative() {
    return getMode() === 'native';
  }

  function isWeb() {
    return getMode() === 'web';
  }

  function shouldRegisterServiceWorker() {
    return isWeb() && 'serviceWorker' in navigator;
  }

  function resolveAssetPath(path) {
    return new URL(path, document.baseURI).href;
  }

  function createRouteHref(route = '') {
    const cleanRoute = String(route || '').replace(/^#?\/?/, '').replace(/^\//, '');
    return cleanRoute ? `#/${cleanRoute}` : '#/';
  }

  globalThis.LandosRuntime = Object.freeze({
    getMode,
    isNative,
    isWeb,
    shouldRegisterServiceWorker,
    resolveAssetPath,
    createRouteHref,
  });
})();
