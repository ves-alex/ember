// ember service worker — stratégie no-cache (calque Nudge v36+).
// On enregistre le SW uniquement pour permettre l'installation PWA.
// Aucun fetch handler : le navigateur va chercher chaque ressource sur le réseau,
// ce qui évite tout problème de cache stale après déploiement.

const CACHE_NAME = "ember-v18";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
