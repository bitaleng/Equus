const CACHE_NAME = 'hugaetel-v38';
// 이름이 바뀌면 activate에서 이전 캐시(hugaetel-v37 등)를 전부 삭제함.

// SPA 셸로 취급해 오프라인에서도 바로 열릴 경로
// (React Router가 index.html을 받아 클라이언트 라우팅)
const SPA_SHELL_ROUTES = [
  '/',
  '/index.html',
  '/cctv',
  '/cctv/view',
  '/cctv/remote',
  '/screen/view',
  '/admin/cctv',
  '/admin/licenses',
  '/settings',
];

self.addEventListener('install', (event) => {
  event.waitUntil(installSW());
  self.skipWaiting();
});

async function putShell(cache, route, html, headers) {
  await cache.put(route, new Response(html, { headers }));
}

async function installSW() {
  try {
    const cache = await caches.open(CACHE_NAME);

    const indexResponse = await fetch('/index.html', { cache: 'no-cache' });
    if (!indexResponse.ok) throw new Error('index.html fetch failed');

    const html = await indexResponse.text();
    const shellHeaders = new Headers(indexResponse.headers);
    shellHeaders.set('content-type', 'text/html; charset=utf-8');

    // CCTV 포함 SPA 경로를 index.html 셸로 사전 캐시 → Netlify 다운 시에도
    // /cctv/view?token=... 내비게이션이 캐시에서 열림
    for (const route of SPA_SHELL_ROUTES) {
      await putShell(cache, route, html, shellHeaders);
    }

    // index.html에 직접 링크된 자산
    const assetUrls = [...new Set(
      (html.match(/\/assets\/[^"'\s>]+\.(js|css|wasm)/g) || [])
    )];

    // 빌드 시 생성되는 전체 자산 목록 (peerjs 등 동적 import 청크 포함)
    let precacheUrls = [];
    try {
      const listRes = await fetch('/sw-precache.json', { cache: 'no-cache' });
      if (listRes.ok) {
        const list = await listRes.json();
        if (Array.isArray(list)) precacheUrls = list.filter((u) => typeof u === 'string');
      }
    } catch {
      // 개발/구버전 빌드에는 파일이 없을 수 있음
    }

    const staticUrls = [
      '/manifest.json',
      '/sw-precache.json',
      '/favicon.png',
      '/icon-192.png',
      '/icon-512.png',
    ];

    const allUrls = [...new Set([...assetUrls, ...precacheUrls, ...staticUrls])];

    const results = await Promise.allSettled(
      allUrls.map((url) =>
        fetch(url, { cache: 'no-cache' }).then((res) => {
          if (res.ok) return cache.put(url, res);
        })
      )
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    console.log(
      `[SW] 설치 완료: 셸 ${SPA_SHELL_ROUTES.length} + 자산 ${succeeded}/${allUrls.length}`
    );
  } catch (err) {
    console.error('[SW] 설치 오류 (오프라인 상태에서 설치한 경우):', err);
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => {
            console.log('[SW] 이전 캐시 삭제:', k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

function shouldBypassSW(url) {
  const path = url.pathname;
  return (
    path.endsWith('.wasm') ||
    path.startsWith('/@fs/') ||
    path.startsWith('/@vite/') ||
    path.startsWith('/src/')
  );
}

function isNavigationRequest(request) {
  return (
    request.mode === 'navigate' ||
    (request.method === 'GET' &&
      (request.headers.get('accept') || '').includes('text/html'))
  );
}

// 매장별 아이콘·매니페스트(/store/*)와 API(/api/*, /.netlify/*)는 실제로는 페이지가
// 아니라 서버가 즉석에서 만들어주는 응답이라, 주소창에 직접 입력하는 등의 이유로
// text/html Accept 헤더가 붙어도 SPA 셸(index.html)로 가로채면 안 된다.
// 이걸 놓치면 서버는 멀쩡한데 SW가 캐시된 index.html을 먼저 돌려줘서
// "이미지가 안 보인다"는 식의 오진단을 유발한다.
function isDynamicApiPath(pathname) {
  return (
    pathname.startsWith('/store/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/.netlify/')
  );
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (shouldBypassSW(url)) return;

  event.respondWith(handleFetch(event.request, url));
});

async function handleFetch(request, url) {
  // 내비게이션: 쿼리스트링(?token=) 무시하고 pathname 셸 우선
  if (isNavigationRequest(request) && !isDynamicApiPath(url.pathname)) {
    const shell =
      (await caches.match(url.pathname)) ||
      (await caches.match('/index.html')) ||
      (await caches.match('/'));
    if (shell) {
      refreshCache(request);
      return shell;
    }
  }

  const cached = await caches.match(request);
  if (cached) {
    const isHashedAsset = url.pathname.startsWith('/assets/');
    if (!isHashedAsset) refreshCache(request);
    return cached;
  }

  // pathname만으로도 캐시 히트 시도 (동일 경로 다른 쿼리)
  const byPath = await caches.match(url.pathname);
  if (byPath) return byPath;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const isWasm = url.pathname.endsWith('.wasm');
      if (!isWasm || contentType.includes('application/wasm')) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
        // SPA 셸 경로면 pathname 키로도 저장
        if (isNavigationRequest(request) || SPA_SHELL_ROUTES.includes(url.pathname)) {
          cache.put(url.pathname, response.clone());
        }
      }
    }
    return response;
  } catch {
    if (isNavigationRequest(request)) {
      const fallback =
        (await caches.match(url.pathname)) ||
        (await caches.match('/index.html'));
      if (fallback) return fallback;
    }
    throw new Error('[SW] 캐시와 네트워크 모두 실패: ' + request.url);
  }
}

async function refreshCache(request) {
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
      const url = new URL(request.url);
      if (SPA_SHELL_ROUTES.includes(url.pathname)) {
        cache.put(url.pathname, response.clone());
      }
    }
  } catch {
    // 오프라인이면 무시
  }
}
