/**
 * Offline play.
 * - The iOS and Android apps are native and carry everything they need, so this file is for the web build only.
 * - On the web a service worker caches every file on first visit; after that the game opens offline.
 */
export function registerOffline() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:' || import.meta.env.DEV) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* the game still runs online */ }); });
}
