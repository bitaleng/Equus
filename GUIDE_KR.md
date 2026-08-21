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

## 2. 매장 구분 방식 (빌드 하나, 서버가 매장을 구분)

예전에는 매장(에쿠스/히즈/홈24)마다 `.env`를 다르게 두고 코드를 따로 빌드했지만, 지금은
**빌드가 하나뿐**입니다. 모든 매장이 같은 Netlify 사이트, 같은 zip 파일을 씁니다.

매장별 앱 이름·아이콘·기본 요금 설정은 코드에 없습니다. 매장 주인이 앱을 처음 열어
**라이선스 키를 입력하는 순간**, 서버(Netlify Functions + Netlify Blobs)가 그 키에 연결된
매장 프로필을 찾아 내려줍니다.

새 매장을 등록하려면(코드 수정·재빌드 불필요):
1. `client/public/store-admin.html` 파일을 브라우저로 열기
2. 관리자 키(Netlify 사이트의 `STORE_ADMIN_KEY` 환경변수) 입력
3. 매장 이름·아이콘·기본 설정 입력 후 저장
4. 라이선스 연결 탭에서 `license-generator.html`로 발급한 키의 고객 코드를 입력해 매장에 연결

라이선스 접두사(`EQUS-`/`HIZZ-`/`HOME-`)는 여전히 3종류뿐입니다 — 새 매장도 이 중 하나를
재사용하고, 실제로 어느 매장인지는 `store-admin.html`에서 연결한 매핑이 결정합니다.

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

완료되면 `netlify.zip` 파일 하나가 생성됩니다 — 모든 매장이 이 파일 하나를 씁니다.
(체험판 빌드가 필요하면 `bash build-netlify.sh demo` → `netlify-demo.zip`)

Windows PowerShell을 쓴다면:
```powershell
.\build-netlify.ps1
```

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
3. netlify.zip 을 Netlify에 드래그 앤 드롭
4. 완료! (모든 매장에 한 번에 반영됩니다)
```

---

## 6. 환경변수 (.env 파일)

`.env.example` 파일을 복사해서 `.env`로 이름을 바꾸세요. 매장별로 다르게 설정할 값은
이제 없습니다 — `.env`는 로컬 개발용 서버 설정(DB 연결 등)만 담당합니다.

Netlify 사이트에는 별도로 `STORE_ADMIN_KEY` 환경변수를 등록해야 `store-admin.html`
관리자 도구를 쓸 수 있습니다 (Netlify 대시보드 → Site configuration → Environment variables).

스마트 락커 하드웨어를 쓰지 않는다면 `DATABASE_URL`과 `ADMIN_KEY`는 비워두어도 됩니다.

---

## 6-1. 백업을 클라우드에도 이중으로 남기기 (선택, 매장에서 직접)

앱 자체에는 구글 드라이브 로그인 기능이 없습니다(여러 매장이 쓰는 범용 앱이라, 매장마다 자기
계정으로 앱 코드 수정 없이 붙일 수 있는 방법을 씁니다). 대신 시스템설정 → 데이터 관리 →
"마감 백업 파일 위치"에서 지정하는 **덮어쓸 파일**을, 그 매장이 이미 쓰는 클라우드 동기화 폴더
안에 두면 됩니다.

- **PC**: 구글 드라이브 데스크톱(또는 원드라이브 등)을 설치하면 내 PC에 동기화 폴더가 생깁니다.
  "덮어쓸 파일 지정" 버튼을 누를 때 저장 위치를 그 동기화 폴더 안으로 선택하세요. 이후 마감마다
  그 파일이 갱신될 때마다 클라우드에도 자동으로 올라갑니다.
- **안드로이드 태블릿**: 기기별 파일 지정 기능이 없어 마감마다 다운로드 폴더에 새 파일이
  쌓입니다. 구글 드라이브 앱의 "폴더 자동 업로드"(또는 유사한 자동 업로드 앱)를 다운로드 폴더에
  연결해두면, 새로 생기는 백업 파일이 자동으로 클라우드에 올라갑니다. 오래된 파일은 가끔 정리해
  주세요(마감 백업은 항상 그날까지의 전체 데이터를 담고 있어 최신 파일 하나만 있어도 복구에
  충분합니다).

---

## 7. 라이선스 키 발급

1. `license-generator.html` 파일을 브라우저로 열기 (더블클릭)
2. 고객 코드, 만료일, 라이선스 종류(V1 EQUS / V2 HIZZ / V3 HOME) 선택
3. 생성된 키(예: `HIZZ-XXXX-XXXX-XXXX`)를 고객에게 전달
4. `store-admin.html`에서 같은 고객 코드로 그 매장의 프로필과 이 키를 연결
5. 자세한 내용: `OFFLINE_LICENSE_GUIDE.md` 참고

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

**Q: 매장마다 따로 빌드해야 하나요?**
A: 아니요. `bash build-netlify.sh` 한 번으로 만든 `netlify.zip` 하나를 모든 매장이 씁니다.
매장별 이름/아이콘/설정은 `store-admin.html`에서 등록하면 됩니다 (2장 참고).

---

## 10. 알려진 버그 / 최근 변경사항

- ✅ 재대여(반납 후 동일 품목 다시 대여) 기능 추가
- ✅ 추가요금 결제방식 저장 버그 수정
- ✅ 정산 페이지 환불 UI 개선
- ✅ returnCompleted 필드 camelCase 버그 수정 (재대여 기능 핵심 수정)

**스마트 락커 하드웨어**: 현재 코드에 연동 기능이 있으나, 실제 하드웨어 없이는 동작하지 않습니다.
**CCTV 기능**: WebSocket 기반 카메라 스트리밍 코드가 있으나 하드웨어 종속적입니다.
