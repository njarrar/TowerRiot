/**
 * Offline play.
 * - On iOS and Android the game ships inside the app (Capacitor), so it never needs the network.
 * - On the web a service worker caches every file on first visit; after that the game opens offline.
 */
export function registerOffline() {
  const native = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  if (native || !('serviceWorker' in navigator) || location.protocol === 'file:' || import.meta.env.DEV) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* the game still runs online */ }); });
}
