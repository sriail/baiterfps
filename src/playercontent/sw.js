const CACHE_NAME = 'baiterfps-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/vendor/three/build/three.module.js',
  '/vendor/three/examples/jsm/loaders/GLTFLoader.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isMapAsset    = url.pathname.startsWith('/maps/');
  const isVendorAsset = url.pathname.startsWith('/vendor/');

  if (isMapAsset || isVendorAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
  }
});
