// 버전 변경 시 화면 캐시만 교체합니다. API·개인정보는 절대 캐시하지 않습니다.
const CACHE_PREFIX = 'cheongyak-moa-shell-';
const CACHE_NAME = CACHE_PREFIX + 'react-v0.2.0';
const SHELL = ['/', '/app.js', '/style.css', '/responsive.css', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png'];
const ALLOWED = new Set(SHELL);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !ALLOWED.has(url.pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(url.pathname, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(url.pathname)) || new Response('화면 파일을 불러올 수 없습니다. 서버 연결 후 다시 시도하세요.', { status:503, headers:{'Content-Type':'text/plain; charset=utf-8'} })));
});
