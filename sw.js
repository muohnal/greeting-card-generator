/* 오프라인 실행용 서비스워커.
   앱 파일 전체를 한 번 받아두면 그 뒤로는 인터넷 없이도 열린다.
   글꼴 CDN 같은 외부 요청은 캐시하지 않고 그대로 통과시킨다. */
/* muohnal.github.io 는 여러 프로젝트가 같은 오리진을 쓴다.
   Cache Storage 는 서비스워커 scope 와 달리 오리진 단위로 공유되므로,
   이 앱이 만든 캐시(PREFIX 로 시작하는 것)만 골라서 지워야
   같은 계정의 다른 프로젝트 캐시를 날리지 않는다. */
const PREFIX = 'greeting-card-generator-';
const CACHE = PREFIX + 'v2';
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
      .then(ks => Promise.all(
        ks.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))
      ))
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
        // 캐시를 먼저 주고, 뒤에서 새 버전을 받아둔다.
        // waitUntil 로 묶지 않으면 브라우저가 응답 직후 워커를 종료해
        // 갱신이 끝나지 않고, 사용자가 계속 옛 버전을 보게 된다.
        e.waitUntil(
          fetch(req).then(res => {
            if (res && res.ok) return caches.open(CACHE).then(c => c.put(req, res.clone()));
          }).catch(() => {})
        );
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
