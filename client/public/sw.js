const CACHE_NAME = 'hugaetel-v10';

// 설치 단계: index.html을 파싱해서 Vite가 생성한 모든 자산을 자동으로 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(installSW());
  self.skipWaiting();
});

async function installSW() {
  try {
    const cache = await caches.open(CACHE_NAME);

    // 1. index.html 가져오기
    const indexResponse = await fetch('/index.html', { cache: 'no-cache' });
    if (!indexResponse.ok) throw new Error('index.html fetch failed');

    const html = await indexResponse.text();

    // 2. index.html을 / 와 /index.html 두 경로로 저장
    await cache.put('/index.html', new Response(html, {
      headers: indexResponse.headers
    }));
    await cache.put('/', new Response(html, {
      headers: indexResponse.headers
    }));

    // 3. Vite가 생성한 /assets/ 경로의 JS·CSS 파일 자동 추출
    const assetUrls = [...new Set(
      (html.match(/\/assets\/[^"'\s>]+\.(js|css)/g) || [])
    )];

    // 4. 기타 정적 파일
    const staticUrls = [
      '/manifest.json',
      '/sql-wasm.wasm',
      '/favicon.png',
      '/icon-192.png',
      '/icon-512.png',
    ];

    const allUrls = [...assetUrls, ...staticUrls];

    // 5. 전체 캐시 (일부 실패해도 나머지는 계속 진행)
    const results = await Promise.allSettled(
      allUrls.map(url =>
        fetch(url, { cache: 'no-cache' })
          .then(res => {
            if (res.ok) return cache.put(url, res);
          })
      )
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    console.log(`[SW] 설치 완료: ${succeeded + 2}/${allUrls.length + 2}개 파일 캐시됨`);
  } catch (err) {
    console.error('[SW] 설치 오류 (오프라인 상태에서 설치한 경우):', err);
  }
}

// 활성화: 이전 버전 캐시 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] 이전 캐시 삭제:', k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

// Fetch 처리: 캐시 우선 → 네트워크 → index.html 폴백
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 같은 출처 요청만 처리
  if (url.origin !== self.location.origin) return;

  event.respondWith(handleFetch(event.request));
});

async function handleFetch(request) {
  // 1. 캐시에서 먼저 찾기
  const cached = await caches.match(request);
  if (cached) {
    // 해시가 없는 파일(index.html, manifest.json 등)은 백그라운드에서 갱신
    const url = new URL(request.url);
    const isHashedAsset = url.pathname.startsWith('/assets/');
    if (!isHashedAsset) {
      refreshCache(request);
    }
    return cached;
  }

  // 2. 캐시에 없으면 네트워크 시도
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // 3. 네트워크 실패 시 → 내비게이션이면 index.html 반환 (SPA 오프라인 지원)
    const fallback = await caches.match('/index.html');
    if (fallback) return fallback;
    throw new Error('[SW] 캐시와 네트워크 모두 실패: ' + request.url);
  }
}

// 백그라운드 캐시 갱신 (stale-while-revalidate)
async function refreshCache(request) {
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
  } catch {
    // 오프라인이면 무시
  }
}
