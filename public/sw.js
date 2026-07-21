/* Nexyra AI — Service Worker (PWA) */
const VERSION = "v1.0.0";
const STATIC_CACHE = `nexyra-static-${VERSION}`;
const RUNTIME_CACHE = `nexyra-runtime-${VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/images/nexyra-logo.png",
  "/images/nexyra-logo-transparent.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE && k.startsWith("nexyra-"))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache API / auth / supabase / SSE
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase.co") ||
    req.headers.get("accept")?.includes("text/event-stream")
  ) {
    return;
  }

  // Same-origin static assets → cache-first
  if (url.origin === self.location.origin) {
    if (/\.(?:js|css|png|jpg|jpeg|webp|svg|woff2?|ttf|ico)$/.test(url.pathname)) {
      event.respondWith(
        caches.match(req).then(
          (cached) =>
            cached ??
            fetch(req).then((res) => {
              const copy = res.clone();
              caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
              return res;
            }),
        ),
      );
      return;
    }

    // HTML navigations → network-first, fallback cache
    if (req.mode === "navigate") {
      event.respondWith(
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
            return res;
          })
          .catch(() => caches.match(req).then((c) => c ?? caches.match("/"))),
      );
    }
  }
});
