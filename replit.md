# Rest Hotel Entry Management System (휴게텔 입실관리)

## Overview

This Progressive Web App (PWA) digitizes manual ledger processes for rest hotels, enabling offline tracking of customer check-ins, locker assignments, pricing, and daily sales. It transforms traditional paper-based workflows into a zero-cost, digital solution by storing all data locally in the browser using SQLite WASM, eliminating server costs and internet dependency after initial installation. The system includes features for real-time locker status, sales aggregation, expense tracking, and daily financial settlements.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

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

- **Enhanced filtering statistics in LogsPage**: Added total amount display alongside count when filters are applied:
  - **Filter result statistics**: Now shows both count and total amount (e.g., "현금: 15건 | ₩213,000")
  - **Improved UX**: Users no longer need to export to Excel just to see filtered totals
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