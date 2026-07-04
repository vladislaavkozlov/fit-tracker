/* KILL-SWITCH: на время активной разработки офлайн-кэш отключён.
   Этот воркер сносит все прежние кэши, отписывается и заставляет страницы перезагрузиться со свежими файлами. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    await self.registration.unregister();
    var clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(function (c) { try { c.navigate(c.url); } catch (err) { } });
  })());
});
/* нет обработчика fetch → запросы идут напрямую в сеть, кэш не подменяет файлы */
