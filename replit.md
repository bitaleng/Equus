# Rest Hotel Entry Management System (휴게텔 입실관리)

## Overview

This Progressive Web App (PWA) digitizes manual ledger processes for rest hotels, enabling offline tracking of customer check-ins, locker assignments, pricing, and daily sales. It transforms traditional paper-based workflows into a zero-cost, digital solution by storing all data locally in the browser, eliminating server costs and internet dependency after initial installation. The system includes features for real-time locker status, sales aggregation, expense tracking, and daily financial settlements.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

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