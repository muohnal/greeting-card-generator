/* 오프라인 실행용 서비스워커.
   앱 파일 전체를 한 번 받아두면 그 뒤로는 인터넷 없이도 열린다.
   글꼴 CDN 같은 외부 요청은 캐시하지 않고 그대로 통과시킨다. */
const CACHE = 'card-gen-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 글꼴 CDN 등은 건드리지 않는다

  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) {
        // 캐시를 먼저 주고, 뒤에서 조용히 새 버전을 받아둔다
        fetch(req).then(res => {
          if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));   // 오프라인 + 미캐시 → 앱 화면으로
    })
  );
});
