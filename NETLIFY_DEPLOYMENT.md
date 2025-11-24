# 🚀 EQUUS MANAGEMENTS - Netlify 배포 가이드

## ✅ 배포 준비 완료

이 프로젝트는 **완전히 오프라인 작동하는 PWA**로, Netlify에 무료로 배포할 수 있습니다.

---

## 📦 1단계: 프로젝트 빌드

```bash
vite build
```

빌드가 완료되면 `dist/public/` 폴더에 다음 파일들이 생성됩니다:
- ✅ index.html
- ✅ manifest.json (PWA 설정)
- ✅ sw.js (Service Worker)
- ✅ sql-wasm.wasm (SQLite WASM - 645KB)
- ✅ assets/ (번들된 JS/CSS)
- ✅ 아이콘 파일들 (favicon, icon-192, icon-512)

---

## 🌐 2단계: Netlify에 배포

### 방법 1: 드래그 앤 드롭 (가장 간단!)

1. **Netlify 로그인**: https://app.netlify.com
2. **"Sites" 탭** 클릭
3. **"Add new site" → "Deploy manually"** 선택
4. **`dist/public` 폴더를 드래그 앤 드롭**
5. 완료! 🎉

### 방법 2: Netlify CLI (자동화)

```bash
# Netlify CLI 설치
npm install -g netlify-cli

# 로그인
netlify login

# 배포
netlify deploy --prod --dir=dist/public
```

### 방법 3: Git 연동 (CI/CD)

1. GitHub/GitLab/Bitbucket에 코드 푸시
2. Netlify에서 "Add new site" → "Import from Git"
3. 리포지토리 선택
4. 빌드 설정은 **자동으로 netlify.toml 읽음**
5. "Deploy site" 클릭

---

## ⚙️ 빌드 설정 (이미 완료됨)

`netlify.toml` 파일이 모든 것을 자동으로 처리합니다:

```toml
[build]
  command = "vite build"
  publish = "dist/public"

[build.environment]
  NODE_VERSION = "20"
```

**추가 설정 필요 없음!** ✅

---

## 🔧 배포 후 확인사항

### 1. PWA 설치 테스트
- 모바일/태블릿에서 배포된 URL 접속
- 주소창의 "홈 화면에 추가" 클릭
- **"EQUUS"** 앱이 바탕화면에 설치됨

### 2. 오프라인 작동 테스트
- 앱 설치 후 인터넷 연결 끊기
- 앱이 정상 작동하는지 확인
- Service Worker가 모든 파일 캐싱했는지 확인

### 3. SQLite WASM 로딩 확인
- 개발자 도구 (F12) → Network 탭
- `sql-wasm.wasm` (645KB) 로딩 확인
- 데이터베이스 작동 테스트

---

## 📱 PWA 기능 확인

배포 후 다음 기능들이 정상 작동해야 합니다:

- ✅ **오프라인 작동**: 인터넷 없이도 완전히 작동
- ✅ **홈 화면 설치**: "EQUUS" 앱으로 설치
- ✅ **SQLite WASM**: 브라우저 내 로컬 데이터베이스
- ✅ **Service Worker**: 자동 캐싱 및 업데이트
- ✅ **RFID 리더기**: USB 키보드 모드로 바코드 스캔
- ✅ **멀티 팝업 시스템**: 동시 여러 고객 처리

---

## 🎯 배포 후 URL 예시

Netlify가 자동으로 생성하는 URL:
```
https://equus-management-abc123.netlify.app
```

커스텀 도메인 연결 가능:
```
https://equus.yourdomain.com
```

---

## 💰 비용

- **Netlify 무료 플랜**: ✅ 충분함
- **대역폭**: 100GB/월
- **빌드 시간**: 300분/월
- **추가 비용**: ❌ 없음 (완전히 오프라인 작동)

---

## 🔄 업데이트 배포

코드 수정 후:

```bash
# 1. 빌드
vite build

# 2. 재배포 (드래그 앤 드롭 또는 CLI)
netlify deploy --prod --dir=dist/public
```

Git 연동 시: 코드 푸시하면 자동 배포됨 🚀

---

## ❗ 중요 사항

### Service Worker 업데이트
- 코드 변경 후 재배포하면 Service Worker가 자동 업데이트
- 사용자는 앱 재시작 시 최신 버전으로 업데이트됨

### 브라우저 캐시
- `netlify.toml`에서 Service Worker 캐싱 설정 완료
- manifest.json, sw.js는 캐시 안 함 (즉시 업데이트)
- 정적 에셋은 1년 캐싱 (파일명 해시로 캐시 무효화)

### 보안
- ✅ HTTPS 자동 적용 (Netlify 기본 제공)
- ✅ 데이터는 브라우저 로컬 저장소에만 저장
- ✅ 서버 없음 = 해킹 위험 없음

---

## 🆘 문제 해결

### PWA가 설치 안 됨
- manifest.json 경로 확인: `/manifest.json`
- HTTPS 확인 (HTTP에서는 PWA 설치 불가)

### Service Worker 오류
- 브라우저 콘솔 확인 (F12)
- Service Worker 재등록: 설정 → 캐시 삭제

### SQLite WASM 로딩 실패
- Network 탭에서 `sql-wasm.wasm` 로딩 확인
- MIME type 확인: `application/wasm`

---

## 📞 지원

배포 문제 발생 시:
1. Netlify 빌드 로그 확인
2. 브라우저 개발자 도구 콘솔 확인
3. Service Worker 상태 확인: `chrome://serviceworker-internals`

---

**준비 완료! 지금 바로 배포하세요!** 🚀
