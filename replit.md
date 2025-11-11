# Rest Hotel Entry Management System (휴게텔 입실관리)

## Overview

This Progressive Web App (PWA) digitizes manual ledger processes for rest hotels, enabling offline tracking of customer check-ins, locker assignments, pricing, and daily sales. It transforms traditional paper-based workflows into a zero-cost, digital solution by storing all data locally in the browser, eliminating server costs and internet dependency after initial installation. The system includes features for real-time locker status, sales aggregation, expense tracking, and daily financial settlements.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### November 11, 2025
- **내국인 추가요금 기준시간 변경**: 자정(00:00) → 01:00으로 변경
  - **변경사항**: 내국인 고객의 추가요금 첫 체크포인트를 01:00으로 변경
  - **로직**: 입실 시간이 01:00 이전이면 같은 날 01:00이 첫 체크포인트, 01:00 이후면 다음 날 01:00
  - **외국인**: 기존 24시간 기준 유지 (변경 없음)
  - **수정 파일**: shared/businessDay.ts의 calculateAdditionalFee() 함수 ✓

- **정산 페이지 기간별 정산 조회 기능 추가**: 기간별 매출 합계 분석 지원
  - **기간 선택**: 시작/종료 영업일을 선택하여 기간별 매출 조회
  - **매출 합계**: 입실매출(현금/카드/이체), 추가요금 매출, 대여물품 매출 항목별 합계 표시
  - **UI**: 파란색 조회 Card + 녹색 결과 Card로 구분하여 표시
  - **검증**: 시작일 > 종료일 시 에러 토스트 표시
  - **수정 파일**: client/src/lib/localDb.ts (getDetailedSalesByBusinessDayRange 함수 추가), client/src/pages/ClosingPage.tsx (UI 추가) ✓

- **홈화면 레이아웃 토글 기능 추가**: 입실관리 패널 숨기기/표시 기능
  - **왼쪽 패널**: 오늘현황 + 매출집계 (기존 토글 버튼 유지)
  - **오른쪽 패널**: 입실관리 (새로운 토글 버튼 추가)
  - **확대 모드**: 오른쪽 패널 숨기면 왼쪽 패널이 전체 화면 확대
  - **패턴 잠금**: 숨긴 패널 복원 시 패턴 입력 필요
  - **버튼 위치**: 왼쪽 패널 헤더에 Maximize2 아이콘 버튼 추가
  - **수정 파일**: client/src/pages/Home.tsx (isLockerPanelCollapsed state 및 UI 추가) ✓

### November 10, 2025
- **테스트 데이터 생성 로직 완전 수정**: 과거 데이터 제거 + RED 락커 추가요금 보장
  - **문제 1**: 테스트 데이터 생성 시 과거 3일치 데이터 자동 생성 → 초기 설치 시 불필요한 과거 매출 기록 표시
  - **해결 1**: 과거 데이터 생성 로직 완전 제거 (Line 2311-2313)
  - **문제 2**: 내국인 RED 락커가 야간 19:00 이후 입실로 생성 → 첫 자정 무료 규칙으로 추가요금 0원
  - **해결 2**: 내국인 RED는 주간(07:00-18:59) 또는 야간 < 07:00(00:00-06:59) 입실만 생성 (Line 2223-2238)
  - **검증 강화**: `calculateAdditionalFee()` 함수로 추가요금 > 0 검증 (최대 20회 재시도)
  - **결과**: 테스트 데이터는 오늘 영업일 데이터만 생성, RED 락커 추가요금 100% 보장 ✓
  - **Settings 페이지 설명 업데이트**: "3일치 과거 데이터" → "현재 사용 중인 락커" ✓

- **정산 페이지 영업일 선택 기능 추가**: 과거 30일 영업일 정산 데이터 관리 지원
  - **영업일 선택 드롭다운**: 헤더에 과거 30일 영업일 목록 Select 추가
  - **정산 상태 Badge**: 각 영업일 옵션에 "확정"(녹색), "저장됨"(파란색), "미정산"(빨간색) 상태 표시
  - **미정산 경고 Alert**: 저장했지만 확정하지 않은 영업일만 경고 표시 (데이터 없는 날짜 제외)
  - **정산 데이터 로드**: 과거 영업일 선택 시 저장된 정산 데이터 자동 로드
  - **UX 개선**: 10시 넘어가도 어제 영업일 정산 가능, 정산 누락 방지
  - **테스트**: playwright e2e 테스트 통과 (영업일 선택, 저장, Badge 표시, 경고 Alert 모두 확인) ✓

- **매출 중복 계산 버그 수정 및 오늘현황 추가요금 배지 표시 기능 추가**: 같은 영업일 추가요금 처리 완전 개선
  - **문제 1 (매출 중복 계산)**: 같은 영업일 추가요금이 finalPrice와 additionalFeeSales 양쪽에 중복 집계됨
  - **해결 1**: Line 260-266에서 다른 영업일 추가요금만 additionalFeeSales에 합산
    - 같은 영업일 추가요금: finalPrice에만 포함 (입실 요금 + 추가요금)
    - 다른 영업일 추가요금: additionalFeeSales에만 포함 (별도 row)
    - 결과: 매출 집계에서 중복 카운트 완전 제거 ✓
  - **문제 2 (추가요금 배지 누락)**: 같은 영업일 추가요금 발생 항목에 배지 표시 없음
  - **해결 2**: TodayStatusTable에 "추가" 오렌지색 배지 표시
    - Line 214-222: 같은 영업일 추가요금 ID Set 생성
    - Line 254-257: entries에 hasSameDayFee 플래그 추가
    - TodayStatusTable.tsx: "추가" 배지 표시 (같은 영업일 추가요금)
    - 결과: 운영자가 같은 영업일 추가요금 항목을 즉시 식별 가능 ✓
  - **테스트**: playwright e2e 테스트 통과 (9개 항목, "추가" 및 "추가요금" 배지 모두 확인) ✓

- **최종요금 표시 로직 완전 수정**: 영업일 간 퇴실 vs 같은 영업일 퇴실 구분
  - **문제**: 다른 영업일 퇴실 시 최종요금에 기본요금(10,000원) 표시 (정산 완료된 금액)
  - **해결**: `getDisplayPrice()` 함수로 조건부 표시 로직 구현
    - 다른 영업일 퇴실: 추가요금만 표시 (예: 5,000원)
    - 같은 영업일 퇴실: 기본요금 + 추가요금 (예: 15,000원)
    - 추가요금 없음: 기본요금만 표시 (예: 10,000원)
  - **적용 범위**: 테이블 표시, Excel 내보내기, PDF 내보내기, 합계 계산
  - **레거시 데이터 처리**: `businessDay` 필드 없으면 `entryTime`으로 영업일 계산
  - **DB 무결성 보장**: `locker_logs.final_price`는 변경하지 않음 (매출집계 보호)
  - 결과: 로그 페이지 최종요금 표시가 정산 시점 매출에 정확히 일치 ✓

- **그린색 락커 테스트 데이터 생성 로직 재작성**: 내국인/외국인 별도 처리
  - **내국인 그린**: 이전 영업일 야간(19:00~) 입실 + 아직 첫 자정 안 넘김
  - **외국인 그린**: 이전 영업일 입실 + 아직 24시간 안 지남 (더 자유로운 생성 가능)
  - **검증 로직**: `calculateAdditionalFee()` 사용하여 추가요금 0원 보장 (최대 20회 재시도)
  - **국적 비율**: 50% 내국인, 50% 외국인으로 균형 있게 생성
  - 결과: 그린색 락커가 현재 시각에 관계없이 안정적으로 생성됨 ✓

### November 9, 2025
- **추가매출(대여물품) 필터 기능 강화**: 락커번호 검색 및 날짜/시간 조회 기능 추가
  - **락커번호 검색**: 특정 락커의 대여 기록만 빠르게 조회 가능
  - **날짜/시간 필터 적용**: 상단 "기간 조회" 설정이 추가매출 섹션에도 자동 적용
  - **필터 안내 표시**: 현재 적용 중인 날짜/시간 필터를 시각적으로 표시
  - **필터 조합**: 항목(담요/롱타올) + 지급방식 + 보증금처리 + 락커번호 모두 조합 가능 ✓

- **테스트 데이터 생성 버그 5건 수정 완료**: 그린/레드/옐로우/블루 락커 생성 로직 정확성 개선
  - **그린색 락커 시간 계산**: previousBusinessDayStart 직접 사용하여 정확한 이전 영업일 시간대 생성
  - **레드색 락커 시간 계산**: previousBusinessDayStart + 1일 + 새벽(02:00-08:00) 시간으로 수정
  - **레드색 락커 요금 버그**: timeType에 따라 주간/야간 요금 정확히 적용 (21:00 야간 입실 = 15,000원)
  - **미래 시간 데이터 생성 방지**: Yellow/Blue 락커는 현재 시각 이전 시간만 생성하도록 제한
  - **같은 영업일 추가요금 표시**: finalPrice = basePrice + additionalFee로 수정 (10,000원 → 15,000원 정확히 표시)
  - 결과: 모든 테스트 데이터가 시간대별 정확한 요금으로 과거 시간에만 생성됨 ✓

### November 8, 2025
- **락커 색상 로직 명확화**: 이전 영업일 입실(그린색) vs 오늘 영업일 입실(옐로우/블루) 구분 규칙 문서화
  - **그린색**: 이전 영업일에 입실해서 오늘 영업일에 아직 퇴실하지 않은 락커
  - **옐로우**: 오늘 영업일 주간(07:00-19:00) 입실 + 사용중
  - **블루**: 오늘 영업일 야간(19:00-익일 07:00) 입실 + 사용중
  - **레드**: 추가요금 발생 (우선순위 최상위)
  - 로직: entryTime < businessDayStart → 그린색 (이전 영업일 입실)
  - 예: 11월 7일 14:00 입실 → 11월 8일 09:50 옐로우 (같은 영업일) → 11월 8일 10:00 이후 그린색 (이전 영업일) ✓

- **추가요금 테스트 데이터 생성 로직 수정**: 추가요금은 실제 퇴실 시에만 기록되도록 변경
  - **문제**: additional_fee_events를 테스트 데이터 생성 시 미리 기록하여 아직 퇴실하지 않은 락커가 이미 퇴실 처리된 것처럼 표시됨
  - **해결**: 테스트 데이터는 locker_logs만 in_use 상태로 생성, additional_fee_events는 실제 퇴실 시 생성
  - **보장된 시나리오**: 전날 영업일 12:00-18:00 주간 입실 → 자정 넘김 → 추가요금 발생 예상 (5000원) → 현재 in_use
  - 락커 버튼: 빨간색으로 표시 (추가요금 발생 감지)
  - 오늘 현황: 추가요금 발생 없음 (아직 퇴실하지 않음)
  - 실제 퇴실 시: additional_fee_events에 추가요금 기록 → 오늘 현황 및 매출에 반영 ✓

- **입출기록 로그 날짜/시간 필터 수정**: Interval overlap 로직으로 모든 관련 기록 포함
  - **문제**: 날짜/시간 필터 사용 시 추가요금이 필터되지 않고, 기간을 포함하는 기록도 누락됨
  - **해결**: Interval overlap 로직 적용 (`entry_time <= end AND (exit_time IS NULL OR exit_time >= start)`)
  - **포함되는 경우**: 기간 안 입실, 기간 안 퇴실, 기간 완전 포함, 사용 중 (exit_time IS NULL)
  - **적용 함수**: getEntriesByDateRange, getEntriesByDateTimeRange
  - 추가요금 이벤트는 별도로 올바르게 필터링 (checkout_time 기준) ✓

## System Architecture

### UI/UX Decisions
- React with TypeScript, Wouter for routing, and Vite for building.
- shadcn/ui and Tailwind CSS for a customizable and accessible UI.
- Split-panel layout optimized for desktop/tablet, touch-first design, high-contrast visual states, and tactile feedback.

### Technical Implementations
- **PWA & Offline Capabilities**: Service Worker for offline caching and Web App Manifest for an installable experience. Cache-first strategy for static assets; network-first with cache fallback for dynamic content. All operations are client-side; no backend API calls.
- **Business Logic**: Custom business day calculation (e.g., 10:00 AM boundary) and time-based pricing (day/night rates). All datetime operations use Korea Standard Time (KST) via `date-fns-tz`. Integrated expense management by category and payment method. Daily closing/settlement feature for financial reconciliation, including expected cash, actual cash, and discrepancy tracking. Automated settlement reminders based on configured business day start hour.
- **Data Storage**: SQLite WASM (`sql.js`) for in-browser database, persisted in `localStorage`.
    - **`locker_logs`**: Stores all entry/exit records, including locker number, entry/exit times, pricing details, and status.
    - **`locker_daily_summaries`**: Aggregated daily metrics like total visitors and sales.
    - **`system_metadata`**: Key-value store for operational state.
    - **`expenses`**: Tracks daily operational costs by category, amount, and payment method.
    - **`closing_days`**: Records daily financial settlements.
- Data export functionality to Excel (.xlsx) and PDF.
- Automatic data cleanup for records older than one year and manual data reset options.

### Feature Specifications
- Real-time locker status display with color-coded system for various states (e.g., in-use, vacant, overdue, previous day entry).
- Detailed daily sales aggregation, distinguishing between entry fees, additional charges, and rental revenues.
- Comprehensive expense tracking and categorization.
- Financial settlement process with discrepancy reporting.
- Robust handling of additional fees, ensuring independent payment method tracking from initial entry payments.
- Accurate revenue reporting for rental items, distinguishing between rental fees and deposit handling (received, forfeited, refunded).
- Enhanced logging and filtering capabilities for historical data, including detailed statistics.

## External Dependencies

### Third-Party Services
- Google Fonts CDN: Inter and Roboto font families.
- sql.js CDN: SQLite WASM binary.

### NPM Packages
- sql.js: SQLite in WebAssembly.
- @radix-ui/*: Headless UI component primitives.
- date-fns & date-fns-tz: Date manipulation and timezone handling.
- react-hook-form: Form state management.
- wouter: Lightweight client-side routing.
- class-variance-authority: Type-safe CSS variant management.
- tailwind-merge: Utility for merging Tailwind classes.
- xlsx: Excel file export.
- jspdf & jspdf-autotable: PDF export functionality.