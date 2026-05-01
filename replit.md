# Rest Hotel Entry Management System (휴게텔 입실관리)

## Overview

This Progressive Web App (PWA) digitizes manual ledger processes for rest hotels, enabling offline tracking of customer check-ins, locker assignments, pricing, and daily sales. It transforms traditional paper-based workflows into a zero-cost, digital solution by storing all data locally in the browser, eliminating server costs and internet dependency after initial installation. The system includes features for real-time locker status, sales aggregation, expense tracking, and daily financial settlements. Its purpose is to provide a robust, cost-effective, and user-friendly management system for rest hotels, enhancing operational efficiency and financial transparency.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application uses React with TypeScript, Wouter for routing, and Vite for building. UI components are styled with shadcn/ui and Tailwind CSS, prioritizing accessibility and customizability. The layout is optimized for desktop/tablet with a touch-first design, featuring high-contrast visuals and tactile feedback.

### Technical Implementations
The system now operates as a full-stack application with both offline (PWA) and online (smart locker) capabilities:

**Offline Mode (PWA):**
- Service Worker for caching and offline operation
- Local SQLite WASM (`sql.js`) persisted in `localStorage` for customer entries, sales, expenses
- Business day calculations (10:00 AM boundary) and time-based pricing
- All datetime operations using Korea Standard Time (KST) via `date-fns-tz`

**Online Mode (Smart Locker System):**
- Express.js backend server on port 5000
- PostgreSQL database via Drizzle ORM for hardware device management
- REST API endpoints for locker control and device management
- WebSocket server for real-time communication:
  - `/ws/lockers` - Client real-time updates for locker status changes
  - Hardware controller WebSocket with HMAC authentication
- Smart locker state machine: idle → reserved → shoe_unlocked → key_removed → wardrobe_in_use → checkout_pending → locked

**Database Schema (PostgreSQL):**
- `hardware_devices` - Hardware controller registration and status
- `locker_hardware` - Physical locker hardware state (lock state, door state, key presence)
- `locker_commands` - Command queue for hardware operations
- `locker_events` - Event log for hardware state changes
- `licenses` - License key management for device registration

**Offline License System (For Static Hosting):**
- Cryptographic license validation using HMAC-SHA256 signatures
- Client-side only validation - no server calls needed
- Works with Netlify free hosting (zero monthly cost)
- License format: `EQUS-XXXX-XXXX-XXXX` (customer code + expiry date + signature)
- Admin tool: `license-generator.html` - runs locally without internet
- Demo mode with `?demo=true` URL parameter (7-day trial, PWA install blocked)
- Expiry warning shown 30 days before license expires
- See `OFFLINE_LICENSE_GUIDE.md` for detailed usage instructions

### Feature Specifications
Key features include:
- **Smart Locker Hardware Integration:**
  - Hardware device registration and management via Settings page
  - Real-time WebSocket communication with locker controllers
  - HMAC-authenticated API for hardware devices
  - State machine for locker occupancy tracking (shoe locker → wardrobe flow)
  - Command queue for hardware operations (unlock_shoe, lock_shoe, unlock_wardrobe, lock_wardrobe)
  - Event logging for hardware state changes
- Real-time locker status display with a color-coded system for various states (in-use, vacant, overdue, previous day entry).
- Detailed daily sales aggregation, differentiating between entry fees, additional charges, and rental revenues.
- Comprehensive expense tracking and categorization.
- A financial settlement process with discrepancy reporting and automated reminders.
- Robust handling of additional fees, ensuring independent payment method tracking.
- Accurate revenue reporting for rental items, distinguishing rental fees from deposit handling.
- Enhanced logging and filtering for historical data, including detailed statistics.
- Barcode scan logging system for anti-theft monitoring, tracking all barcode scans with processed status and business day tracking.
- NFC auto-detection toggle mode for RFID locker keys on NFC-capable devices:
  - One-click activation enables continuous tag recognition without repeated button presses
  - Automatically pauses when dialogs open to prevent accidental scans
  - Proper memory management with cleanup of all event listeners on stop/unmount
  - Real-time timestamp calculation for accurate time-type and pricing on each scan
  - Works independently and simultaneously with USB RFID readers (keyboard/HID mode)
- Data export functionality to Excel (.xlsx) and PDF.
- Automated data cleanup for records older than one year and manual data reset options.
- **Per-menu lock system:** Security changed from sidebar-level lock to per-route lock:
  - Sidebar always opens freely (no pattern required)
  - Each menu route can be individually locked/unlocked (`localStorage: locked_menu_routes`)
  - Default locked routes: `/logs`, `/scan-logs`, `/settings`, `/closing`, `/expenses`, `/sales-report`
  - `/cash-register` (시재금관리) is a separate page, unlocked by default
  - Admin configures per-menu locks in Settings → 보안 → 메뉴별 잠금 설정
  - Session memory: once unlocked, stays accessible until page refresh
  - Helper: `client/src/lib/menuLock.ts`
- **시재금관리 독립 페이지:** Extracted from Settings to `/cash-register` (`CashRegisterPage.tsx`) so it can be independently unlocked for temporary staff

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