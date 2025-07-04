const CACHE_NAME = "geste-cache-v2";

// L' "App Shell" : uniquement les fichiers statiques et essentiels.
// PAS de .map, PAS de fichiers de données dynamiques (.json, .wav).
const APP_SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/main.js",
  "/audio.js",
  "/midi.js",
  "/network.js",
  "/graphics.js",
  "/gestion-touch.js",
  "/mlp.js",
  "/style.css",
  "/NexusUI.js",
  "/pixi.min.js",
  "/swipe.min.js",
  "/socket.io.min.js",
  "/faust/multi_Ef_dsp_wasm/faustwasm/index.js",
  "/faust/multi_Ef_dsp_wasm/create-node.js",
  "/faust/multi_Ef_dsp_wasm/dsp-meta.json",
  "/faust/multi_Ef_dsp_wasm/dsp-module.wasm",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Événement d'installation : met en cache l'App Shell.
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("Service Worker: Mise en cache de l'App Shell.");
        return cache.addAll(APP_SHELL_URLS);
      })
  );
});

// Événement d'activation : nettoie les anciens caches.
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log("Service Worker: Nettoyage de l'ancien cache :", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Événement fetch : sert depuis le cache, puis le réseau.
// Met également en cache les nouvelles ressources demandées.
self.addEventListener("fetch", event => {

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        // Si la réponse est dans le cache, on la retourne.
        // Sinon, on va la chercher sur le réseau, on la met en cache ET on la retourne.
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // On ne met en cache que les requêtes valides (pas les erreurs 404, 500 etc.)
          if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });
        return response || fetchPromise;
      });
    })
  );
});