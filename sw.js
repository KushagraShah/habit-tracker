// Minimal service worker.
//
// Purpose: makes the app installable as a standalone "app" on Android/iOS
// home screens. It deliberately does NOT cache anything - every request goes
// to the network, so a deploy can never leave you stuck on stale assets.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Required for installability on Android. No respondWith() call, so the
// browser performs its normal network fetch.
self.addEventListener('fetch', () => {});
