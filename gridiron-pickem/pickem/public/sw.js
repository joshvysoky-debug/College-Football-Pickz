// Minimal service worker for Gridiron Pick'em.
//
// This intentionally does NOT cache API routes or page data — scores and
// picks change constantly, and stale cached data would be worse than no
// offline support at all. It exists mainly to satisfy the "installable PWA"
// checklist so Add to Home Screen works well on Android/Chrome.
//
// If you want real offline support later (e.g. caching the app shell/static
// assets), this is the file to extend with a cache-first strategy for
// same-origin GET requests to /_next/static/* and /icon-*.png.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // No-op: let every request pass straight through to the network.
});
