const CACHE_NAME = "axolotl-sim-v10";
const IMAGE_ASSETS = [
  "./assets/generated/background.png",
  "./assets/processed/axolotl-sheet.png",
  "./assets/processed/kelp-sheet.png",
  "./assets/processed/star-sheet.png",
  "./assets/processed/icon-192.png",
  "./assets/processed/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(IMAGE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isImage = IMAGE_ASSETS.some((a) => url.pathname.endsWith(a.replace(".", "")));

  if (isImage) {
    // Cache-first for images — de ändras sällan
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        return res;
      }))
    );
  } else {
    // Network-first för HTML/JS/CSS — hämta alltid senaste
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
