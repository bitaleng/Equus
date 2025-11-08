# Rest Hotel Entry Management System (휴게텔 입실관리)

## Overview

This Progressive Web App (PWA) digitizes manual ledger processes for rest hotels, enabling offline tracking of customer check-ins, locker assignments, pricing, and daily sales. It transforms traditional paper-based workflows into a zero-cost, digital solution by storing all data locally in the browser using SQLite WASM, eliminating server costs and internet dependency after initial installation. The system includes features for real-time locker status, sales aggregation, expense tracking, and daily financial settlements.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### November 8, 2025
- **CRITICAL BUG FIX #1: 추가요금 결제수단 독립성 완전 구현**: ClosingPage에서 추가요금 결제가 입실 결제 비율을 따르지 않고 독립적으로 집계되도록 수정
  - 문제: 추가요금 결제가 입실 결제 비율로 분배되어 실제 결제수단과 다르게 집계됨
  - 해결: ClosingPage.tsx에서 비율 계산 로직 제거, additional_fee_events 테이블에서 직접 결제수단별 집계
  - 결과: 추가요금 현금/카드/계좌이체 금액이 실제 결제 내역과 정확히 일치

- **CRITICAL BUG FIX #2: 오늘현황 테이블 추가요금 표시 정확도 개선**: 같은 영업일 추가요금이 별도 행으로 명확히 표시되도록 수정
  - 문제: 같은 영업일 추가요금이 입실 기록과 혼합되어 표시됨 (추가 뱃지로만 구분)
  - 해결 1: Home.tsx에서 모든 추가요금을 additional_fee_events에서 읽어 별도 행으로 생성
  - 해결 2: TodayStatusTable.tsx에서 추가요금 뱃지 및 displayPrice 로직 제거, 단순화
  - 해결 3: 모든 추가요금 행을 `additionalFeeOnly: true`로 설정하여 방문자 수 중복 카운트 방지
  - 결과: 추가요금이 항상 별도 행으로 표시 (입실시간: 공란, timeType: '추가요금', 빨간색 금액)

- **추가요금 테스트 데이터 생성 함수 완전 재작성**: 새로운 버그 수정과 호환되도록 테스트 데이터 생성 로직 개선
  - 문제 1: additional_fee_events 테이블에 데이터를 추가하지 않아 새 로직과 호환되지 않음
  - 문제 2: 타임스탬프가 영업일 경계를 넘어갈 수 있어 자동 삭제 위험
  - 해결 1: locker_logs + additional_fee_events 두 테이블 모두 업데이트
  - 해결 2: getBusinessDayRange 기준으로 타임스탬프 생성 (영업일 시작 + 2/6시간)
  - 해결 3: ISO 포맷(yyyy-MM-dd)으로 business_day 저장하여 deleteOldData 호환성 보장
  - 결과: 락커 1(현금 입실+카드 추가요금), 락커 2(카드 입실+계좌이체 추가요금) 테스트 데이터 생성

### November 7, 2025
- **ClosingPage UI 매출 구조 명확화**: 추가요금과 렌탈 매출을 별도 섹션으로 분리하여 가독성 개선
  - 상태 변수 구조화: baseEntrySales, additionalFeeSales, entrySales, rentalSales 분리 관리
  - UI 섹션 번호 체계:
    - ① 일반요금합계 (입실 기본요금)
    - ② 추가요금합계 (시간초과 추가요금)
    - ③ 입실매출 총합 (① + ②)
    - ④ 추가매출 (대여품목: 렌탈비 + 보증금, 환급 제외)
    - ⑤ 총매출 (③ + ④)
  - 사용자 정의 매출 개념 반영: "추가요금" = 시간초과 추가 입장료, "추가매출" = 대여품목 매출

- **환급 보증금 완전 제외 구현**: updateRentalTransaction에서 revenue 전달 여부와 무관하게 payment* 필드 자동 조정
  - 문제: Home.tsx에서 revenue를 명시적으로 전달하여 payment* 조정 로직 미실행
  - 해결: localDb.ts에서 payment* 조정 로직을 if (updates.revenue === undefined) 블록 밖으로 이동
  - 결과: 환급된 보증금이 paymentCash/Card/Transfer 집계에서 완전히 제외되어 정확한 결제수단별 매출 집계
  - E2E 테스트로 검증 완료: 환급 시 rental fee만 매출 포함, deposit 완전 제외

- **추가요금 매출 기록 및 정렬 개선**: 추가요금은 퇴실 시간(checkout_time) 기준으로 정렬 및 매출 산입
  - 오늘현황/입출기록: 추가요금은 퇴실 시간 기준으로 최신순 정렬
  - 이전 영업일 입실 락커의 추가요금도 오늘 매출에 포함 (입실시간 공란, 금액 빨간색 표시)
  - 방문자 수: 오늘 입실한 경우만 카운트, 추가요금만 있는 경우 제외

- **정산 페이지 매출 계산 방식 변경**: Home 페이지와 동일한 실시간 계산 방식 적용
  - 입실 매출 = 입실요금(entry_time 기준) + 추가요금(checkout_time 기준)
  - 추가 매출 = 렌탈 대여비 + 보증금('받음'+'몰수', 환급 제외)
  - 총 매출 = 입실 매출 + 추가 매출

- **보증금 '몰수' 중복 매출 방지**: 영업일 기준 보증금 매출 산입 로직 및 결제수단별 집계 정확도 개선
  - 대여 시 '받음': 렌탈비 + 보증금 → 매출
  - 반납 시 '몰수' (같은 영업일): 렌탈비 + 보증금 → 매출
  - 반납 시 '몰수' (다른 영업일): 렌탈비만 → revenue (보증금은 0, 이미 대여일 매출로 계산됨)
  - 반납 시 '환급': 렌탈비만 → revenue (보증금은 지출 처리)
  - updateRentalTransaction에서 revenue 변경 시 paymentCash/Card/Transfer도 항상 비례 조정
  - 반올림 오차는 최대 금액 채널에 할당하여 합계 정확성 보장 (±0원)

- **LogsPage 날짜 필터링 정확도 개선**: entry_time 기준 필터링으로 변경
  - 날짜 범위 조회 시 정확히 해당 기간 입실 기록만 표시
  - interval overlap 로직 제거로 영업일 범위 밖 데이터 포함 문제 해결

### November 6, 2025
- **Fixed payment method breakdown in closing page**: Corrected critical bug where rental item payments were incorrectly distributed by combining locker entry payment with rental item revenue. Entry sales (locker fees) and additional sales (rental items) are now completely separate revenue streams:
  - **Entry sales**: Locker entrance fee only, using payment amounts entered at check-in
  - **Additional sales**: Rental items (blankets/towels) with deposits, using each item's individual payment method
  - Each rental item's full revenue (rental fee + deposit if received/forfeited) is allocated to its designated payment method
  - Payment method breakdown now correctly displays cash/card/transfer amounts for both rental fees and forfeited deposits
  - Added Math.round() to all ratio-based calculations to eliminate decimal amounts in reporting

- **Fixed rental item payment preservation and timestamp precision**: Resolved critical accounting inconsistencies when editing entries after business day rollover:
  - **Payment preservation**: Existing rental items now retain their original payment allocation; only newly added items receive proportional tender splits from locker fee payments
  - **Timestamp precision**: Both `totalRentalAmount` and per-item `revenue` calculations now use each transaction's recorded `returnTime` (or pending timestamp) instead of current save time for cross-day detection
  - **Accounting accuracy**: Prevents same-day refunded deposits from re-inflating the payment distribution base when editing entries on subsequent days, ensuring new rental items inherit correct cash/card/transfer ratios

- **Completely separated entry sales from additional sales**: Fixed fundamental business logic error where rental item payments were incorrectly tied to locker entry payment ratios:
  - **Independent revenue streams**: Entry sales (locker fees) and additional sales (rental items) are now completely separate with no cross-contamination
  - **100% payment allocation**: Each rental item's full revenue (rental fee + deposit if received/forfeited) is allocated to its designated payment method (cash/card/transfer)
  - **Removed ratio-based distribution**: Eliminated totalRentalAmount/totalAmount aggregation that was incorrectly applying locker payment ratios to rental items
  - **Accurate financial reporting**: Closing page correctly sums independent entry and rental totals by payment method without mixing revenue sources

- **Added expense category management UI in Settings page**: Implemented complete CRUD interface for user-managed expense categories:
  - **Settings page integration**: New "지출 카테고리 관리" section with Receipt icon and category list
  - **Full CRUD operations**: Create, read, update, and delete expense categories with validation and toast notifications
  - **UI features**: Add/edit dialog with name input, edit/delete buttons for each category, empty state message
  - **Data protection**: Default categories (like "보증금환급") cannot be deleted to maintain system integrity

- **Fixed critical business day calculation bug**: Resolved issue where entry business_day was calculated using stale currentTime state variable:
  - **Root cause**: currentTime updated only every 60 seconds, causing incorrect business_day assignment when entries were created between minute boundaries
  - **Impact**: Many entries stored with wrong business_day (e.g., entries at 10:01 stored as previous day if currentTime still at 09:58)
  - **Solution**: Changed all business_day calculations to use real-time `new Date()` instead of stale `currentTime` state
  - **Affected locations**: Home.tsx lines 311, 438 for entry creation/modification
  - **Added recalculation tool**: New "영업일 재계산" button in Settings → 데이터 관리 to fix existing data by recalculating all business_day values based on entry_time/rental_time/checkout_time

- **Enhanced overall statistics in LogsPage**: Added total count and amount display for both filtered and unfiltered views:
  - **Overall totals**: Always shows total count and amount when no filters are applied, excluding cancelled entries
  - **Filter result statistics**: Shows count and total amount when filters are active (e.g., "현금: 15건 | ₩213,000")
  - **Cancelled entries exclusion**: Overall totals automatically exclude cancelled entries to show accurate revenue
  - **Improved UX**: Users can see totals without applying filters or exporting to Excel
  - **Supported filters**: Payment method (cash/card/transfer), time type (day/night), cancelled status, additional fee status

## System Architecture

### Frontend
- **React** with TypeScript, **Wouter** for routing, and **Vite** for building.
- **shadcn/ui** and **Tailwind CSS** for a customizable and accessible UI.
- Local component state with React hooks; data persists in browser localStorage as a base64-encoded SQLite database.
- Split-panel layout optimized for desktop/tablet, touch-first design, high-contrast visual states, and tactile feedback.

### PWA & Offline Capabilities
- **Service Worker** for offline caching and **Web App Manifest** for an installable experience.
- Cache-first strategy for static assets; network-first with cache fallback for dynamic content.
- All operations are client-side; no backend API calls.

### Business Logic
- Custom business day calculation (e.g., 10:00 AM boundary) and time-based pricing (day/night rates).
- All datetime operations use Korea Standard Time (KST) via `date-fns-tz`.
- Shared logic for pricing and time calculations.
- Integrated expense management by category and payment method.
- Daily closing/settlement feature for financial reconciliation, including expected cash, actual cash, and discrepancy tracking.
- Automated settlement reminders based on configured business day start hour.

### Data Storage & Schema
- **SQLite WASM** (`sql.js`) for in-browser database, persisted in `localStorage`.
- **`locker_logs`**: Stores all entry/exit records, including locker number, entry/exit times, pricing details, and status.
- **`locker_daily_summaries`**: Aggregated daily metrics like total visitors and sales, recalculated on entry updates.
- **`system_metadata`**: Key-value store for operational state.
- **`expenses`**: Tracks daily operational costs by category, amount, and payment method.
- **`closing_days`**: Records daily financial settlements, including income, expenses, cash, and discrepancies.
- Data export functionality to Excel (.xlsx) and PDF.
- Automatic data cleanup for records older than one year and manual data reset options.

## External Dependencies

### Third-Party Services
- **Google Fonts CDN**: Inter and Roboto font families.
- **sql.js CDN**: SQLite WASM binary.

### NPM Packages
- **sql.js**: SQLite in WebAssembly.
- **@radix-ui/**\*: Headless UI component primitives.
- **date-fns** & **date-fns-tz**: Date manipulation and timezone handling.
- **react-hook-form**: Form state management.
- **wouter**: Lightweight client-side routing.
- **class-variance-authority**: Type-safe CSS variant management.
- **tailwind-merge**: Utility for merging Tailwind classes.
- **xlsx**: Excel file export.
- **jspdf** & **jspdf-autotable**: PDF export functionality.