'use strict';
// そよぎ式AACアプリ Service Worker
const CACHE = 'soyogi-aac-v4';
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'i18n.js',
  'data/cards.js',
  'data/lang.zh.js', 'data/lang.es.js', 'data/lang.hi.js', 'data/lang.ar.js',
  'data/lang.pt.js', 'data/lang.fr.js', 'data/lang.ru.js', 'data/lang.id.js',
  'data/lang.de.js', 'data/lang.ko.js', 'data/lang.it.js', 'data/lang.bn.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  if (ev.request.method !== 'GET') return;
  ev.respondWith(
    caches.match(ev.request).then(hit => hit ||
      fetch(ev.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(ev.request, copy));
        return res;
      })
    ).catch(() => caches.match('index.html'))
  );
});
