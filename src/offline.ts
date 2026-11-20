/**
 * Offline play.
 * - On iOS and Android the game ships inside the app (Capacitor), so it never needs the network.
 * - On the web a service worker caches every file on first visit; updates wait politely until the player clicks Reload.
 */
export function registerOffline(onUpdateReady?: (apply: () => void) => void) {
  const native = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  if (native || !('serviceWorker' in navigator) || location.protocol === 'file:' || import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    // A first visit has no worker yet. When the first one takes over there is nothing new to load, so do not reload then.
    const hadWorker = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !hadWorker) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register('./sw.js').then(reg => {
      const announce = (worker: ServiceWorker | null) => {
        if (!worker || !onUpdateReady) return;
        onUpdateReady(() => worker.postMessage({ type: 'SKIP_WAITING' }));
      };
      if (reg.waiting) announce(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller) announce(next);
        });
      });
    }).catch(() => { /* the game still runs online */ });
  });
}
