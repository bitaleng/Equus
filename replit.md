# Rest Hotel Entry Management System (휴게텔 입실관리)

## Overview

This Progressive Web App (PWA) digitizes manual ledger processes for rest hotels, enabling offline tracking of customer check-ins, locker assignments, pricing, and daily sales. It transforms traditional paper-based workflows into a zero-cost, digital solution by storing all data locally in the browser, eliminating server costs and internet dependency after initial installation. The system includes features for real-time locker status, sales aggregation, expense tracking, and daily financial settlements.

## User Preferences

Preferred communication style: Simple, everyday language.

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