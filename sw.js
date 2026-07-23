const CACHE = "momentmeter-v32";
const ASSETS = ["./", "./index.html", "./manifest.json", "./app_icons/icon-180.png", "./app_icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  // CRITICAL: never touch cross-origin requests (GitHub API/sync, any external fetch).
  // Caching those would serve a stale Gist and silently break device-to-device sync.
  let sameOrigin = false;
  try { sameOrigin = new URL(e.request.url).origin === self.location.origin; } catch (err) {}
  if (!sameOrigin) return;               // let the network handle it, uncached

  const isPage = e.request.mode === "navigate" || e.request.url.endsWith("index.html");
  if (isPage) {
    // network-first for the app shell, so updates arrive; cache fallback keeps it offline-capable
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put("./index.html", copy));
        return res;
      }).catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }
  // same-origin static assets: cache-first
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit =>
      hit ||
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
    )
  );
});
