# Netlify 배포 가이드

## 📋 배포 전 체크리스트

이 프로젝트는 **완전한 클라이언트 측 PWA 앱**으로, 모든 데이터가 브라우저의 localStorage에 저장됩니다.

✅ **이미 준비된 사항:**
- ✅ PWA 설정 (manifest.json, Service Worker)
- ✅ Netlify 설정 파일 (netlify.toml)
- ✅ SPA 라우팅 지원
- ✅ SQLite WASM 파일 포함
- ✅ 오프라인 지원

---

## 🚀 배포 방법 1: Netlify CLI (권장)

### 1단계: Netlify CLI 설치

```bash
npm install -g netlify-cli
```

### 2단계: Netlify 로그인

```bash
netlify login
```

### 3단계: 프로젝트 빌드

```bash
npm run build
```

### 4단계: 배포

**테스트 배포 (임시 URL):**
```bash
netlify deploy
```
- 프롬프트에서 `dist/public` 디렉토리를 선택

**프로덕션 배포:**
```bash
netlify deploy --prod
```

---

## 🖱️ 배포 방법 2: Drag & Drop (가장 쉬움)

### 1단계: 프로젝트 빌드

```bash
npm run build
```

### 2단계: Netlify에 드래그 앤 드롭

1. [Netlify 대시보드](https://app.netlify.com/) 접속
2. "Add new site" → "Deploy manually" 클릭
3. **`dist/public` 폴더**를 드래그 앤 드롭

---

## 🔗 배포 방법 3: Git 연동 (자동 배포)

### 1단계: Git 저장소 연결

1. [Netlify 대시보드](https://app.netlify.com/) 접속
2. "Add new site" → "Import an existing project"
3. GitHub/GitLab/Bitbucket 연결
4. 저장소 선택

### 2단계: 빌드 설정 확인

Netlify가 자동으로 `netlify.toml` 파일을 인식합니다:

```toml
[build]
  command = "vite build"
  publish = "dist/public"
```

설정이 올바르게 표시되는지 확인하고 "Deploy site" 클릭

---

## ⚙️ 중요 설정 사항

### 1. 환경 변수 (필요 없음)
이 앱은 완전한 클라이언트 측 앱이므로 **환경 변수가 필요하지 않습니다**.

### 2. 도메인 설정
- Netlify는 자동으로 `[your-site-name].netlify.app` 도메인 제공
- 커스텀 도메인 연결 가능 (Settings → Domain management)

### 3. HTTPS
- Netlify는 자동으로 무료 SSL 인증서 제공
- PWA는 HTTPS에서만 작동하므로 필수!

---

## 📱 배포 후 확인 사항

### 1. PWA 설치 테스트

배포된 사이트 접속 후:

**데스크톱 (Chrome):**
- 주소창 오른쪽 "설치" 아이콘 확인
- 클릭하여 앱 설치 가능

**모바일 (Safari/Chrome):**
- "홈 화면에 추가" 옵션 확인
- 추가하여 독립 앱으로 실행 가능

### 2. 오프라인 모드 테스트

1. 사이트를 한 번 방문
2. 개발자 도구 → Network → "Offline" 체크
3. 페이지 새로고침 → 정상 작동 확인

### 3. 데이터 지속성 테스트

1. 락카 입실 등록
2. 브라우저 닫기
3. 다시 열어서 데이터 유지 확인

---

## 🔄 업데이트 배포

### 코드 수정 후:

**방법 1 (CLI):**
```bash
npm run build
netlify deploy --prod
```

**방법 2 (Drag & Drop):**
```bash
npm run build
```
그 다음 `dist/public` 폴더를 Netlify에 다시 드래그

**방법 3 (Git):**
```bash
git add .
git commit -m "Update app"
git push
```
자동으로 배포됨!

---

## ⚠️ 중요 주의사항

### 1. 데이터 백업

**모든 데이터는 브라우저의 localStorage에 저장됩니다.**

- ❗ 브라우저 캐시 삭제 시 데이터 손실
- ❗ 다른 브라우저/기기에서는 데이터 공유 안 됨
- ✅ 정기적으로 **엑셀/PDF 내보내기** 기능 사용 권장

### 2. 도메인 변경 시 데이터 손실

**중요:** localStorage는 도메인별로 분리됩니다.

- ❌ `old-site.netlify.app` → `new-site.netlify.app` 이동 시 데이터 손실
- ✅ 같은 Netlify 사이트에서 업데이트하면 데이터 유지
- 💡 도메인 변경 전에 반드시 데이터 내보내기!

### 3. Service Worker 업데이트

코드 수정 후 배포 시:

1. 사용자가 사이트 재방문
2. Service Worker가 자동으로 업데이트 감지
3. 페이지 새로고침 후 새 버전 적용

캐시 이슈가 있을 경우:
```javascript
// client/public/sw.js에서 캐시 이름 변경
const CACHE_NAME = 'hugaetel-v5'; // v4 → v5
```

---

## 🛠️ 문제 해결

### 빌드 실패

**오류:** `Command failed: vite build`

**해결:**
```bash
# 의존성 재설치
rm -rf node_modules package-lock.json
npm install

# 빌드 재시도
npm run build
```

### 404 오류 (페이지 새로고침 시)

**원인:** SPA 라우팅 설정 누락

**확인:** `netlify.toml`에 다음이 있는지 확인:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Service Worker 업데이트 안 됨

**해결:**
1. 브라우저 개발자 도구 → Application → Service Workers
2. "Unregister" 클릭
3. 페이지 새로고침

### SQLite WASM 로딩 실패

**확인:** `client/public/sql-wasm.wasm` 파일 존재 여부

**재빌드:**
```bash
npm run build
```

---

## 📊 성능 최적화

### 1. Lighthouse 점수 확인

배포 후 Chrome 개발자 도구에서:
1. Lighthouse 탭 열기
2. "Generate report" 클릭
3. PWA 점수 확인 (목표: 90점 이상)

### 2. 캐싱 전략

`netlify.toml`에 최적화된 캐싱 설정 포함:
- SQLite WASM: 1년 캐시 (불변)
- JS/CSS 번들: 1년 캐시 (해시로 버전 관리)
- Service Worker: 캐시 없음 (항상 최신 버전)

---

## 📞 지원

### Netlify 상태 확인
- [Netlify Status](https://www.netlifystatus.com/)

### 배포 로그 확인
```bash
netlify logs
```

### 공식 문서
- [Netlify Docs](https://docs.netlify.com/)
- [Vite Build Guide](https://vitejs.dev/guide/build.html)

---

## ✅ 배포 완료 후 체크리스트

- [ ] PWA 설치 테스트 (데스크톱/모바일)
- [ ] 오프라인 모드 테스트
- [ ] 락카 입실/퇴실 기능 테스트
- [ ] 바코드 스캔 테스트
- [ ] 정산 기능 테스트
- [ ] 데이터 내보내기 (엑셀/PDF) 테스트
- [ ] 다크모드 전환 테스트
- [ ] 브라우저 닫고 다시 열어서 데이터 유지 확인

---

**🎉 배포 완료!**

이제 태블릿에서 `https://your-site.netlify.app`로 접속하여 사용하세요!
