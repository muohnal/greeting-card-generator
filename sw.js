/* 오프라인 실행용 서비스워커.

   ── 왜 이렇게 짰나 ──
   처음엔 무조건 캐시를 먼저 주도록 했더니, 한 번 방문한 사람은
   새 버전을 올려도 계속 옛 화면을 봤다. 그래서 화면(HTML)은
   "네트워크 먼저", 아이콘·매니페스트는 "캐시 먼저"로 나눴다.
   인터넷이 없거나 느리면 곧바로 캐시로 넘어간다.                     */

const BUILD = '2026-08-07 18:17';                 // 빌드할 때 실제 시각으로 교체된다
const PREFIX = 'greeting-card-generator-';
const CACHE = PREFIX + BUILD;
const NET_TIMEOUT = 3500;                  // 이보다 느리면 캐시를 쓴다

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
      .then(() => self.skipWaiting())      // 새 워커를 대기시키지 않고 바로 올린다
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(
        /* 이 앱이 만든 캐시만 지운다. Cache Storage 는 오리진 단위로
           공유되므로 같은 계정의 다른 프로젝트 캐시를 건드리면 안 된다. */
        ks.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* 페이지가 '지금 버전 알려줘' 하고 물어볼 때.
   페이지는 이 답과 자기 버전을 대조해서, 정말 낡았을 때만 알림을 띄운다. */
self.addEventListener('message', e => {
  if (e.data === 'version') {
    if (e.ports && e.ports[0]) e.ports[0].postMessage({ build: BUILD });
    else if (e.source) e.source.postMessage({ build: BUILD });
  }
  if (e.data === 'skipWaiting') self.skipWaiting();
});

function netFirst(req) {
  return new Promise(resolve => {
    let done = false;
    const finish = res => { if (!done) { done = true; resolve(res); } };

    const timer = setTimeout(() => {
      caches.match(req).then(hit => hit && finish(hit));
    }, NET_TIMEOUT);

    fetch(req).then(res => {
      clearTimeout(timer);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      finish(res);
    }).catch(() => {
      clearTimeout(timer);
      caches.match(req)
        .then(hit => finish(hit || caches.match('./index.html')))
        .catch(() => finish(Response.error()));
    });
  });
}

function cacheFirst(req, e) {
  return caches.match(req).then(hit => {
    if (hit) {
      e.waitUntil(
        fetch(req).then(res => {
          if (res && res.ok) return caches.open(CACHE).then(c => c.put(req, res.clone()));
        }).catch(() => {})
      );
      return hit;
    }
    return fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html'));
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 글꼴 CDN 등은 건드리지 않는다

  /* 화면 자체는 항상 최신을 먼저 시도한다 */
  const isPage = req.mode === 'navigate' ||
                 req.destination === 'document' ||
                 url.pathname.endsWith('/') ||
                 url.pathname.endsWith('index.html');

  e.respondWith(isPage ? netFirst(req) : cacheFirst(req, e));
});
