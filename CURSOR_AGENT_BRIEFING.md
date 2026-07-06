# Cursor AI 에이전트 브리핑 — He's / EQUS 입실관리매니저

> 이 문서를 Cursor AI 에이전트에게 전달하여 개발 컨텍스트를 공유하세요.

---

## 프로젝트 개요

휴게텔(rest hotel) 입실 관리 PWA (Progressive Web App)입니다.
손님 입실/퇴실, 락커 배정, 요금 계산, 매출 정산, 대여품목 관리 등을 처리합니다.
데이터는 브라우저 내장 SQLite(sql.js)에 저장되어 **서버 없이** 오프라인으로 동작합니다.
Netlify 정적 호스팅으로 배포합니다.

---

## 핵심 아키텍처

### 단일 소스 + 두 스킨 구조

**V1 에쿠스**와 **V2 히즈** 두 버전이 존재하지만, **소스코드는 100% 동일**합니다.
빌드 시 환경변수(`VITE_SKIN`)만 다르게 설정하여 두 버전을 따로 빌드합니다.

```
소스코드 (공유)
  ├── client/skins/v1/   ← V1 전용 아이콘·이미지
  ├── client/skins/v2/   ← V2 전용 아이콘·이미지
  └── client/src/        ← 양쪽 공용 코드 (99%)
```

### 버전별 차이점

| 항목 | V1 에쿠스 | V2 히즈 |
|------|-----------|---------|
| `VITE_SKIN` | `v1` | `v2` |
| 앱 이름 | `LOCKER MANAGER` | `He's 입실관리매니저` |
| 라이선스 접두사 | `EQUS-XXXX-XXXX-XXXX` | `HIZZ-XXXX-XXXX-XXXX` |
| 라이선스 저장 키 | `rest_hotel_license` | `rest_hotel_license_v2` |
| 아이콘 | `client/skins/v1/*.png` | `client/skins/v2/*.png` |
| 테마 색상 | `#0F172A` (어두운 남색) | `#cc44aa` (핑크) |

### 버전별 조건부 코드 처리 방법

소스 안에서 V1/V2를 구분할 때는 아래 패턴을 사용합니다:

```typescript
// 클라이언트 코드에서
const skin = import.meta.env.VITE_SKIN || 'v1';
const isV2 = skin === 'v2';

// localDb.ts에서 (서버/비빌드 환경)
const isV2 = (import.meta as any).env?.VITE_SKIN === 'v2';
```

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | React 18 + TypeScript |
| 빌드 | Vite |
| UI | shadcn/ui + Tailwind CSS |
| 라우팅 | Wouter |
| 로컬 DB | sql.js (SQLite WASM) — IndexedDB에 LZString 압축 저장 |
| 날짜 | date-fns + date-fns-tz (KST 기준) |
| 폼 | react-hook-form + zod |
| 엑셀 내보내기 | xlsx |
| PDF 내보내기 | jspdf + jspdf-autotable |
| 백엔드 (선택) | Express.js + PostgreSQL + Drizzle ORM |

---

## 주요 파일 구조

```
client/
  src/
    pages/          ← 각 화면 (Home, LogsPage, ClosingPage, SettingsPage 등)
    components/     ← 공용 컴포넌트
      LockerOptionsDialog.tsx  ← 핵심: 입실/수정/퇴실 다이얼로그
    lib/
      localDb.ts    ← SQLite 전체 DB 로직 (가장 중요한 파일)
      licenseValidation.ts  ← 오프라인 라이선스 검증
    App.tsx         ← 라우팅 + 사이드바 구조
  skins/
    v1/             ← V1 아이콘·이미지
    v2/             ← V2 아이콘·이미지
  public/
    license-generator.html  ← 라이선스 키 생성 도구 (독립 실행)
server/             ← 스마트 락커 백엔드 (하드웨어 없으면 무관)
shared/
  schema.ts         ← Drizzle ORM 스키마 (백엔드용 PostgreSQL)
```

---

## 로컬 DB 마이그레이션 방식

`client/src/lib/localDb.ts`의 `initializeDatabase()` 함수가 앱 시작 시 자동으로 마이그레이션을 실행합니다.
현재 최신 Step: **32** (직원 시간당 페이 컬럼)

새 컬럼/테이블 추가 시:
1. `localDb.ts`의 `runMigrations()` 함수에 새 Step 추가
2. `CREATE TABLE IF NOT EXISTS` 또는 `ALTER TABLE ... ADD COLUMN` 패턴 사용
3. Step 번호를 순서대로 증가시킬 것

---

## 빌드 방법

### V1 + V2 동시 빌드 (Netlify 배포용)
```bash
bash build-netlify.sh
# 결과: netlify-v1.zip (V1 에쿠스), netlify-v2.zip (V2 히즈)
```

### V2만 빌드 (테스트용)
```bash
VITE_SKIN=v2 VITE_APP_NAME="He's 입실관리매니저" VITE_APP_SHORT_NAME="He's" VITE_APP_DESCRIPTION="라이선스 키를 입력하여 시스템을 활성화하세요." VITE_LICENSE_STORAGE_KEY="rest_hotel_license_v2" npx vite build
```

### Windows에서 빌드
Git Bash를 열고:
```bash
bash build-netlify.sh
```

---

## 개발 서버 실행

```bash
npm install       # 최초 1회
npm run dev       # Linux/Mac/Git Bash
# Windows CMD에서는: npx cross-env NODE_ENV=development npx tsx server/index.ts
```

브라우저: `http://localhost:5000`

---

## 환경변수 (.env 파일)

```env
# V2 히즈 기준
VITE_SKIN=v2
VITE_APP_NAME=He's 입실관리매니저
VITE_APP_SHORT_NAME=He's
VITE_APP_DESCRIPTION=라이선스 키를 입력하여 시스템을 활성화하세요.
VITE_LICENSE_STORAGE_KEY=rest_hotel_license_v2

# 스마트 락커 하드웨어 사용 시만 필요 (없으면 생략)
# DATABASE_URL=postgresql://...
# ADMIN_KEY=your-admin-key
```

---

## 라이선스 시스템

- 서버 없는 오프라인 검증 (HMAC-SHA256)
- 비밀키: `client/src/lib/licenseValidation.ts` 내부에 난독화 하드코딩
- 키 생성: `client/public/license-generator.html` (브라우저에서 직접 실행)
- V1: `EQUS-코드-만료일-서명` / V2: `HIZZ-코드-만료일-서명`
- 비밀키를 절대 커밋하거나 외부 공개하지 말 것

---

## 코드 수정 시 주의사항

### rowsToObjects 반환값은 camelCase
`localDb.ts`의 `rowsToObjects()` 함수는 DB 컬럼을 **camelCase로만** 반환합니다.
예: DB의 `return_completed` → JS에서 `txn.returnCompleted` (snakeCase로 접근하면 undefined)

### 날짜/시간은 KST 기준
`date-fns-tz`의 `toZonedTime`, `fromZonedTime`, `formatInTimeZone` 사용.
timezone: `'Asia/Seoul'`

### 영업일 경계: 오전 10시
기본 설정 `businessDayStartHour: 10` — 오전 10시 이전은 전날 영업일로 처리

### 두 버전 동시 호환 유지
코드 수정 시 V1/V2 모두 정상 동작하는지 확인.
버전별 분기는 `import.meta.env.VITE_SKIN === 'v2'` 조건 사용.

---

## 배포 흐름

```
코드 수정
  → bash build-netlify.sh
  → netlify-v1.zip, netlify-v2.zip 생성
  → Netlify 사이트에 각각 드래그&드롭 업로드
  → 자동 배포 완료 (1~2분)
```

---

## 알려진 상태 및 최근 변경사항

- 최신 마이그레이션: Step 32 (직원 시간당 페이)
- 재대여 기능 추가 완료 (반납완료 품목 → 재대여 버튼)
- returnCompleted camelCase 버그 수정 완료
- 추가요금 결제방식 저장 버그 수정 완료
- 스마트 락커 / CCTV 기능: 코드 존재, 실제 하드웨어 없이는 미사용
