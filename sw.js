const CACHE_NAME = 'malsseum-gido-v19';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './worship.js',
  './keyfinder.js',
  './verses.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const keep = (response) => {
    if (response && response.status === 200) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  };

  // 앱 화면 자체는 먼저 새로 받아 봅니다. 그래야 새 기능을 올린 날
  // 한 번만 열어도 바로 보입니다. 인터넷이 없으면 담아 둔 화면을 씁니다.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(keep)
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // 그림·글씨 파일은 담아 둔 것을 바로 보여 주고, 뒤에서 조용히 새로 받아 둡니다.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then(keep).catch(() => cached);
      return cached || network;
    })
  );
});
