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