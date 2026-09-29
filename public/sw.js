/* 季節帳 service worker — minimal app-shell cache (PWA install + offline shell).
   Scope: same-origin GET only. Cross-origin requests (AniList / TMDB / Annict)
   are never intercepted, so live data stays live. Registered only from the
   deployed http(s) production build — see the guard in index.html. */
const CACHE = "kisetsucho-shell-v1";
// Hashed build assets live next to sw.js — /assets/ at a domain root,
// /kisetsucho/assets/ on GitHub Pages. Derive it instead of hard-coding.
const ASSETS_PATH = new URL("./assets/", self.location).pathname;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // third-party APIs: untouched

  if (url.pathname.startsWith(ASSETS_PATH)) {
    // Hashed build assets: cache-first (a given filename never changes content).
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })()
    );
    return;
  }

  if (req.mode === "navigate") {
    // App shell: network-first so new deploys win; cached copy only when offline.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch (err) {
          const hit = await cache.match(req);
          if (hit) return hit;
          throw err;
        }
      })()
    );
  }
  // Everything else (manifest, icons, sw.js itself): network only.
});
