# Rest Hotel Entry Management System (휴게텔 입실관리)

## Overview

This Progressive Web App (PWA) digitizes manual ledger processes for rest hotels, enabling offline tracking of customer check-ins, locker assignments, pricing, and daily sales. It transforms traditional paper-based workflows into a zero-cost, digital solution by storing all data locally in the browser, eliminating server costs and internet dependency after initial installation. The system includes features for real-time locker status, sales aggregation, expense tracking, and daily financial settlements. Its purpose is to provide a robust, cost-effective, and user-friendly management system for rest hotels, enhancing operational efficiency and financial transparency.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application uses React with TypeScript, Wouter for routing, and Vite for building. UI components are styled with shadcn/ui and Tailwind CSS, prioritizing accessibility and customizability. The layout is optimized for desktop/tablet with a touch-first design, featuring high-contrast visuals and tactile feedback.

### Technical Implementations
The system operates as a PWA with offline capabilities, utilizing a Service Worker for caching. All operations are client-side, with no backend API calls. Business logic includes custom business day calculations (e.g., 10:00 AM boundary) and time-based pricing, with all datetime operations using Korea Standard Time (KST) via `date-fns-tz`. Data is stored locally using SQLite WASM (`sql.js`) persisted in `localStorage`, across tables like `locker_logs`, `locker_daily_summaries`, `system_metadata`, `expenses`, and `closing_days`.

### Feature Specifications
Key features include:
- Real-time locker status display with a color-coded system for various states (in-use, vacant, overdue, previous day entry).
- Detailed daily sales aggregation, differentiating between entry fees, additional charges, and rental revenues.
- Comprehensive expense tracking and categorization.
- A financial settlement process with discrepancy reporting and automated reminders.
- Robust handling of additional fees, ensuring independent payment method tracking.
- Accurate revenue reporting for rental items, distinguishing rental fees from deposit handling.
- Enhanced logging and filtering for historical data, including detailed statistics.
- Data export functionality to Excel (.xlsx) and PDF.
- Automated data cleanup for records older than one year and manual data reset options.

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