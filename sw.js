/* GovForms service worker — versioned app shell + runtime cache for fonts and libraries. */
const VERSION = "govforms-v6.0.1";
const PREFIX = "govforms-";
const SHELL = ["./", "./index.html", "./gov.css?v=6", "./script.js?v=6", "./templates.js?v=6", "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png"];
const RUNTIME_HOSTS = ["cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com", "api.fontshare.com", "cdn.fontshare.com"];
const cacheable = (res) => !!res && (res.ok || res.type === "opaque");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // bypass the HTTP cache so a new worker never precaches a stale shell
      .then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(new Request(u, { cache: "reload" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function networkFirst(request) {
  return fetch(request)
    .then((res) => {
      if (cacheable(res)) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
      }
      return res;
    })
    .catch(() =>
      caches.match(request).then((hit) => {
        if (hit) return hit;
        if (request.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      }),
    );
}

function staleWhileRevalidate(event) {
  const { request } = event;
  return caches.open(VERSION).then((cache) =>
    cache.match(request).then((hit) => {
      const fetching = fetch(request)
        .then((res) => {
          if (cacheable(res)) cache.put(request, res.clone());
          return res;
        })
        .catch(() => hit || Response.error());
      if (hit) {
        event.waitUntil(fetching.catch(() => {}));
        return hit;
      }
      return fetching;
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
      event.respondWith(staleWhileRevalidate(event));
    }
    return;
  }
  if (RUNTIME_HOSTS.includes(url.hostname)) event.respondWith(staleWhileRevalidate(event));
});
