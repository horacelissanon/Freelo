// Minimal service worker — installability only, no offline caching. A cache
// layer is deliberately out of scope: this app deploys often, and a stale
// cached shell serving old JS against a newer API is a worse failure mode
// than "no offline support". `fetch` still needs a listener (even a
// passthrough one) because that's part of what browsers check before
// showing an install prompt.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
