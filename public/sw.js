// Installability-only service worker. The app depends on live market data and
// an authenticated CDSC session, so there is deliberately NO offline caching:
// every request goes straight to the network.
const self = /** @type {ServiceWorkerGlobalScope} */ (globalThis);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
