# Netlify 배포 가이드

## 🚀 자동 배포 (권장)

### 1. GitHub에 코드 푸시
```bash
git add .
git commit -m "Ready for Netlify deployment"
git push origin main
```

### 2. Netlify에서 사이트 생성
1. [Netlify](https://netlify.com)에 로그인
2. "Add new site" → "Import an existing project" 클릭
3. GitHub 저장소 선택
4. 빌드 설정 확인:
   - **Build command**: `vite build`
   - **Publish directory**: `dist/public`
   - **Node version**: 20 (자동 감지됨)

### 3. 배포!
- "Deploy site" 클릭
- 약 1-2분 후 사이트가 자동으로 배포됩니다
- 앱 주소: `https://your-site-name.netlify.app`

---

## 📦 수동 배포 (CLI)

### 1. Netlify CLI 설치
```bash
npm install -g netlify-cli
```

### 2. 로그인 및 초기화
```bash
netlify login
netlify init
```

### 3. 빌드 및 배포
```bash
# 로컬에서 빌드
npm run build  # 또는 vite build

# 배포
netlify deploy --prod
```

---

## 🔄 자동 업데이트

GitHub에 푸시할 때마다 Netlify가 **자동으로 재배포**합니다:

```bash
git add .
git commit -m "Update app"
git push origin main
```

→ Netlify가 자동으로 새 버전을 배포합니다!

---

## ⚙️ 환경 변수 (필요시)

Netlify 대시보드에서 환경 변수 추가:

1. Site settings → Environment variables
2. 변수 추가 (예: API 키)
3. 재배포

---

## 📱 PWA 기능

배포 후 PWA 기능이 자동으로 활성화됩니다:

- ✅ **오프라인 작동**: 인터넷 없이도 사용 가능
- ✅ **홈 화면 추가**: 앱처럼 설치 가능
- ✅ **빠른 로딩**: 캐싱으로 빠른 속도
- ✅ **로컬 데이터베이스**: SQLite WASM (브라우저 내장)

---

## 🛠️ 문제 해결

### 빌드 실패 시
1. 로컬에서 `vite build` 테스트
2. Node 버전 확인 (v20 권장)
3. Netlify 빌드 로그 확인

### 404 오류 (페이지 새로고침)
- `netlify.toml`의 리다이렉트 설정이 자동으로 처리합니다
- 모든 경로가 `/index.html`로 리다이렉트됩니다

### PWA 업데이트 안됨
- 서비스 워커 캐시 헤더가 올바르게 설정되어 있습니다
- 브라우저에서 강제 새로고침: `Ctrl+Shift+R` (Windows) / `Cmd+Shift+R` (Mac)

---

## 📊 배포 후 확인사항

### 1. Lighthouse 점수 확인
Chrome DevTools → Lighthouse 탭:
- ✅ Performance
- ✅ PWA
- ✅ Accessibility
- ✅ Best Practices

### 2. PWA 설치 테스트
모바일/데스크톱에서:
1. 사이트 방문
2. 주소창 옆 "설치" 버튼 확인
3. 홈 화면에 추가

### 3. 오프라인 테스트
1. 개발자 도구 열기 (F12)
2. Network 탭 → Offline 체크
3. 페이지 새로고침 → 정상 작동 확인

---

## 🌐 커스텀 도메인 (선택사항)

Netlify에서 무료로 커스텀 도메인 연결 가능:

1. Site settings → Domain management
2. "Add custom domain" 클릭
3. 도메인 입력 및 DNS 설정
4. 무료 HTTPS 자동 활성화

---

## 📝 주요 설정 파일

- `netlify.toml`: Netlify 배포 설정
- `.nvmrc`: Node 버전 지정 (v20)
- `client/public/manifest.json`: PWA 설정
- `client/public/sw.js`: 서비스 워커

---

## 💡 팁

1. **Preview Deploy**: PR 생성 시 Netlify가 미리보기 사이트를 자동 생성합니다
2. **Build Logs**: 배포 실패 시 Netlify 대시보드에서 로그 확인
3. **Analytics**: Netlify Analytics로 방문자 통계 확인 가능 (유료)

---

## 🎉 배포 완료!

배포 후 다음을 확인하세요:
- ✅ 앱이 정상 작동하는지
- ✅ PWA 설치가 가능한지
- ✅ 오프라인에서도 작동하는지
- ✅ 모든 페이지가 정상 로딩되는지

문제가 있으면 Netlify 대시보드의 빌드 로그를 확인하세요!
