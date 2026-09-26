/* GovForms service worker — versioned app shell + runtime cache for CORS assets. */
const VERSION = "govforms-v6.0.0";
const SHELL = ["./", "./index.html", "./gov.css?v=6", "./script.js?v=6", "./templates.js?v=6", "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png"];
// Only CORS-enabled hosts are cached: opaque responses are padded heavily in quota accounting.
const RUNTIME_HOSTS = ["cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com", "api.fontshare.com", "cdn.fontshare.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function networkFirst(request) {
  return fetch(request)
    .then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
      }
      return res;
    })
    .catch(() =>
      caches.match(request).then((hit) => {
        if (hit) return hit;
        if (request.mode === "navigate") return caches.match("./index.html");
        return Promise.reject(new Error("offline"));
      }),
    );
}

function staleWhileRevalidate(request) {
  return caches.open(VERSION).then((cache) =>
    cache.match(request).then((hit) => {
      const fetching = fetch(request)
        .then((res) => {
          if (res && res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || fetching;
    }),
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin) {
    // the shell is one versioned unit: HTML, JS, CSS, manifest and the news feed are network-first
    if (request.mode === "navigate" || /\.(js|css|webmanifest)$/.test(url.pathname) || url.pathname.endsWith("news.json")) {
      event.respondWith(networkFirst(request));
    } else {
      event.respondWith(staleWhileRevalidate(request));
    }
    return;
  }
  if (RUNTIME_HOSTS.includes(url.hostname)) event.respondWith(staleWhileRevalidate(request));
});
