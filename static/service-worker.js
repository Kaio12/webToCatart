const CACHE_NAME = "geste-cache-v1";
const URLS_TO_CACHE = [
  "/",
  "/static/script.js",
  "/static/audio.js",
  "/static/midi.js",
  "/static/network.js",
  "/static/graphics.js",
  "/static/gestion-touch.js",
  "/static/mlp.js",
  "/static/style.css",
  "/static/NexusUI.js",
  "/static/pixi.min.js",
  "/static/swipe.min.js",
  "/static/faust/multi_Ef.dsp-wasm/faustwasm/index.js.map",
  "/static/faust/multi_Ef.dsp-wasm/faustwasm/index.js",
  "/static/faust/multi_Ef.dsp-wasm/create-node.js",
  "/static/faust/multi_Ef.dsp-wasm/dsp-meta.json",
  "/static/faust/multi_Ef.dsp-wasm/dsp-module.wasm",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/uploads/enr.wav",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(URLS_TO_CACHE);
    }).catch(error => {
      console.error("Erreur lors de l'ajout au cache :", error);
        URLS_TO_CACHE.forEach(async file => {
            try {
              const response = await fetch(file);
              if (!response.ok) {
                console.error("Fichier introuvable ou inaccessible :", file, response.status);
              }
            } catch (e) {
              console.error("Erreur fetch pour", file, e);
            }
          });
    })
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});