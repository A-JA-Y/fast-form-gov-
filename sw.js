/* GovForms service worker — offline shell + runtime caching. */
const VERSION = "govforms-v5.0.0";
const SHELL = [
  "./",
  "./index.html",
  "./gov.css",
  "./script.js",
  "./fx.js",
  "./templates.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];
// Only CORS-enabled hosts are cached: opaque responses are padded heavily in quota accounting.
const RUNTIME_HOSTS = [
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

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
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

function networkFirst(request) {
  return fetch(request)
    .then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(request, copy));
      return res;
    })
    .catch(() =>
      caches.match(request).then((hit) => hit || caches.match("./index.html")),
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
  if (
    sameOrigin &&
    (request.mode === "navigate" || url.pathname.endsWith("news.json"))
  ) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (sameOrigin || RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
