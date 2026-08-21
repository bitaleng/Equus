export function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  if (import.meta.env.VITE_DEMO_BUILD === 'true') {
    navigator.serviceWorker.getRegistrations().then((registrations) =>
      Promise.all(registrations.map((r) => r.unregister()))
    );
    return;
  }

  if (import.meta.env.DEV) {    // Dev: Vite HMR + /@fs/ wasm paths break under SW cache/SPA fallback
    navigator.serviceWorker.getRegistrations().then((registrations) =>
      Promise.all(registrations.map((r) => r.unregister()))
    );
    return;
  }

  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) {
        window.dispatchEvent(new Event('swUpdated'));
      }
    });

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration.scope);

        // 오래 켜둔 앱(태블릿 등)도 새 배포를 스스로 감지하도록 주기적으로 확인.
        // sw.js는 no-cache라 매번 서버 최신본과 바이트 비교 → 변경 시 새 SW 설치.
        const checkForUpdate = () => {
          registration.update().catch(() => {
            // 오프라인이면 무시
          });
        };

        // 1) 즉시 1회
        checkForUpdate();

        // 2) 30분마다
        setInterval(checkForUpdate, 30 * 60 * 1000);

        // 3) 앱이 화면에 다시 보이거나 포커스될 때 (직원이 앱을 다시 켠 순간)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });
        window.addEventListener('focus', checkForUpdate);
      })
      .catch((error) => {
        console.log('Service Worker registration failed:', error);
      });
  });
}
