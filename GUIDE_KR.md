# 개발·빌드·배포 가이드 (한국어 / 비개발자용)

> **대상**: 개발 경험이 없는 매장 운영자 또는 Cursor AI 에이전트와 함께 개발하는 분

---

## 1. 이 앱의 구조 (쉬운 설명)

이 앱은 **두 가지 부분**으로 되어 있습니다:

| 부분 | 역할 | 어디서 실행? |
|------|------|-------------|
| **PWA 앱** (메인) | 손님 입실/퇴실 관리, 매출 정산 등 | Netlify (인터넷에 올린 파일) |
| **스마트 락커 서버** (선택) | 하드웨어 자동 잠금장치 연동 | Replit 서버 |

**일반 매장 운영**은 PWA 앱만 씁니다. 스마트 락커 하드웨어가 없으면 서버 부분은 신경 쓰지 않아도 됩니다.

---

## 2. 두 버전의 차이

| | V1 에쿠스 | V2 히즈 |
|-|-----------|---------|
| 라이선스 접두사 | `EQUS-XXXX-XXXX-XXXX` | `HIZZ-XXXX-XXXX-XXXX` |
| 앱 이름 | LOCKER MANAGER | He's 입실관리매니저 |
| 스킨 설정 | `VITE_SKIN=v1` | `VITE_SKIN=v2` |
| 라이선스 저장 키 | `rest_hotel_license` | `rest_hotel_license_v2` |

두 버전은 **완전히 동일한 소스코드**를 씁니다. `.env` 파일만 다릅니다.

---

## 3. 개발 환경 세팅 (Windows PC)

### 3-1. 사전 준비 (최초 1회)

1. **Node.js 설치**: https://nodejs.org → LTS 버전 다운로드 후 설치
2. **Git 설치**: https://git-scm.com → 기본값으로 설치
3. **Cursor 설치**: https://cursor.com → 다운로드 후 설치

### 3-2. 프로젝트 열기

```
1. source-v2.zip 압축 해제 → 폴더 이름: IVANSAUNA (예시)
2. Cursor 실행 → File → Open Folder → 해당 폴더 선택
3. Cursor 상단 메뉴 → Terminal → New Terminal
```

### 3-3. 패키지 설치 (최초 1회)

터미널에서:
```
npm install
```
수백 개의 패키지를 다운로드합니다. 완료까지 1~3분 소요.

### 3-4. 개발 서버 실행

**Windows에서는 아래 명령어 사용:**
```
npx cross-env NODE_ENV=development npx tsx server/index.ts
```

또는 `package.json`의 `dev` 스크립트를 수정하거나, Git Bash / WSL을 쓰는 경우:
```
npm run dev
```

브라우저에서 `http://localhost:5000` 으로 접속하면 앱이 보입니다.

> **Windows 참고**: `npm run dev`가 오류나면 Git Bash(Git 설치 시 함께 설치됨)에서 실행하세요.

---

## 4. Netlify 배포용 빌드 (매장에 업데이트할 때)

### 4-1. Windows에서 빌드

**Git Bash를 열고** (Windows 시작 → Git Bash 검색):

```bash
bash build-netlify.sh
```

완료되면 두 파일이 생성됩니다:
- `netlify-v1.zip` — V1 에쿠스용
- `netlify-v2.zip` — V2 히즈용

### 4-2. Netlify에 배포

1. https://netlify.com 로그인
2. 해당 사이트 선택
3. **Deploys** 탭 → 화면 아래로 내려서 **"drag and drop"** 영역에 zip 파일을 끌어다 놓기
4. 업로드 완료 후 자동 배포 시작 (1~2분)

---

## 5. 버그 수정·기능 추가 후 배포 순서

```
1. Cursor에서 코드 수정
2. Git Bash에서: bash build-netlify.sh
3. netlify-v2.zip 을 Netlify에 드래그 앤 드롭
4. 완료!
```

---

## 6. 환경변수 (.env 파일)

`.env.example` 파일을 복사해서 `.env`로 이름을 바꾸세요.

**V2 히즈 기준 설정:**
```
VITE_SKIN=v2
VITE_APP_NAME=He's 입실관리매니저
VITE_APP_SHORT_NAME=He's
VITE_APP_DESCRIPTION=라이선스 키를 입력하여 시스템을 활성화하세요.
VITE_LICENSE_STORAGE_KEY=rest_hotel_license_v2
```

스마트 락커 하드웨어를 쓰지 않는다면 `DATABASE_URL`과 `ADMIN_KEY`는 비워두어도 됩니다.

---

## 7. 라이선스 키 발급

1. `license-generator.html` 파일을 브라우저로 열기 (더블클릭)
2. 고객 코드, 만료일, 스킨(V2) 선택
3. 생성된 `HIZZ-XXXX-XXXX-XXXX` 키를 고객에게 전달
4. 자세한 내용: `OFFLINE_LICENSE_GUIDE.md` 참고

---

## 8. 현재 데이터베이스 구조

**PWA 앱 (오프라인)**: 브라우저 내장 SQLite (sql.js)
- 데이터는 손님 기기의 브라우저에 저장됩니다
- 최신 마이그레이션: **Step 32** (직원관리 시간당 페이)

**스마트 락커 서버**: PostgreSQL (Drizzle ORM)
- `shared/schema.ts`에 스키마 정의
- `drizzle.config.ts` 설정 후 `npx drizzle-kit push`로 DB 생성

---

## 9. 자주 묻는 것

**Q: npm install 후 `npm run dev`가 오류납니다**
A: Windows에서 자주 발생합니다. Git Bash를 열어서 `npm run dev`를 실행하세요.

**Q: 빌드 후 앱 내용이 업데이트 안 됩니다**
A: 브라우저에서 강력 새로고침 (Ctrl+Shift+R) 또는 PWA 앱 삭제 후 재설치

**Q: V1과 V2 동시에 빌드됩니까?**
A: 네, `bash build-netlify.sh` 한 번으로 V1과 V2가 모두 빌드됩니다.

---

## 10. 알려진 버그 / 최근 변경사항

- ✅ 재대여(반납 후 동일 품목 다시 대여) 기능 추가
- ✅ 추가요금 결제방식 저장 버그 수정
- ✅ 정산 페이지 환불 UI 개선
- ✅ returnCompleted 필드 camelCase 버그 수정 (재대여 기능 핵심 수정)

**스마트 락커 하드웨어**: 현재 코드에 연동 기능이 있으나, 실제 하드웨어 없이는 동작하지 않습니다.
**CCTV 기능**: WebSocket 기반 카메라 스트리밍 코드가 있으나 하드웨어 종속적입니다.
