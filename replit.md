# Rest Hotel Entry Management System (휴게텔 입실관리)

## Overview

This is a Progressive Web App (PWA) designed for rest hotel (휴게텔) operations that runs **completely offline** in the browser. The application helps counter staff digitize the manual ledger process, allowing them to track customer check-ins, locker assignments, pricing options, and daily sales with simple touch/click interactions. All data is stored locally in the browser using SQLite WASM, eliminating the need for server costs or internet connectivity after initial installation.

**Core Purpose**: Transform the traditional paper notebook workflow into a zero-cost, fully offline digital system where staff can record locker assignments, entry times, pricing options (including discounts and foreigner rates), and manage checkouts with minimal clicks.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & UI Library**
- **React** with TypeScript for type-safe component development
- **Wouter** for lightweight client-side routing (main page and logs page)
- **Vite** as the build tool and development server
- **shadcn/ui** component library built on Radix UI primitives for accessible, customizable components
- **Tailwind CSS** for utility-first styling with custom design tokens

**State Management**
- Local component state with React hooks for UI interactions
- useState/useEffect for data loading from browser SQLite database
- 5-second polling interval for active locker data to ensure real-time updates
- All data persists in browser localStorage as base64-encoded SQLite database

**Key Design Decisions**
- Split-panel layout (40% left / 60% right) optimized for desktop/tablet use
- Touch-first interaction design with generous tap targets (minimum 56px for locker buttons)
- High-contrast visual states for locker availability (white=empty, blue=in-use, gray=checked-out)
- Tactile feedback through CSS animations (scale transform on click) and audio cues
- Material Design principles adapted for business productivity tools

**Component Structure**
- `LockerButton`: Grid-based locker selection with visual state indicators
- `LockerOptionsDialog`: Modal for applying discounts, custom pricing, and foreigner rates
- `TodayStatusTable`: Real-time display of current active lockers
- `SalesSummary`: Daily sales aggregation widget
- `LogsPage`: Historical transaction viewer with date filtering

### PWA & Offline Architecture

**Progressive Web App (PWA)**
- **Service Worker** (`client/public/sw.js`) for offline caching and resource management
- **Web App Manifest** (`client/public/manifest.json`) for installable app experience
- Automatic registration of service worker on page load
- Cache-first strategy for all static assets (HTML, CSS, JS, fonts)
- Network-first with fallback to cache for dynamic content

**Business Logic Layer**
- **Business Day Calculation**: Custom logic treating 10:00 AM as the day boundary (sales aggregated from 10 AM to 9:59 AM next day)
- **Time-based Pricing**: Automatic day/night rate calculation (주간 7AM-7PM: configurable / 야간 7PM-7AM: configurable)
- **Korea Standard Time (KST)**: All datetime operations use Asia/Seoul timezone via `date-fns-tz` to ensure consistency
- **Shared Logic**: Common business rules (pricing, time calculations) exported from `shared/businessDay.ts`

**Browser-Only Operation**
- No backend API calls - all operations performed client-side
- Express server only used for development (serving Vite build)
- Production deployment can be static HTML/JS/CSS files on any hosting
- Zero recurring server costs after deployment

### Data Storage & Schema

**Database Technology**
- **SQLite WASM** (`sql.js`) running entirely in the browser
- **localStorage** for database persistence (base64-encoded SQLite file)
- **localDb.ts** abstraction layer providing CRUD operations
- Database automatically saves to localStorage after every modification
- No server required - all data stays on the user's device

**Schema Design**

1. **locker_logs** (Primary transaction table)
   - Stores all entry/exit records with sequential logging
   - Fields: locker number, entry/exit times, business day, time type (day/night), base price, option type, option amount, final price, status, cancellation flag, notes
   - Supports multiple uses of same locker per business day
   - Status enum: `in_use`, `checked_out`, `cancelled`
   - Option type enum: `none`, `discount` (₩2,000), `custom` (manual input), `foreigner` (₩25,000 flat rate)

2. **locker_daily_summaries** (Aggregated metrics table)
   - Business day as primary key (format: YYYY-MM-DD)
   - Aggregated fields: total visitors, total sales, cancellation count, total discount amount, foreigner count, foreigner sales
   - Automatically recalculated when entries are updated

3. **system_metadata** (Operational state tracking)
   - Key-value store for system-level data (e.g., cleanup tracking)

**Data Flow**
- Entry creation → Auto-populate business day, time type, base price based on entry timestamp → Save to localStorage
- Option selection → Calculate final price (foreigner overrides to configurable amount, discounts subtract from base) → Save to localStorage
- Checkout/cancellation → Trigger summary recalculation for affected business day → Save to localStorage
- Daily summary queries use business day (configurable hour boundary) rather than calendar day
- Database export: Users can export to Excel (.xlsx) for backup/reporting

### External Dependencies

**Third-Party Services**
- **Google Fonts CDN**: Inter and Roboto font families for typography (cached by service worker for offline use)
- **sql.js CDN**: SQLite WASM binary loaded from https://sql.js.org/dist/

**Key NPM Packages**
- **sql.js**: SQLite compiled to WebAssembly for in-browser database
- **@radix-ui/***: Headless UI component primitives (18+ components)
- **date-fns** & **date-fns-tz**: Date manipulation and timezone handling (Asia/Seoul)
- **react-hook-form** & **@hookform/resolvers**: Form state management
- **wouter**: Lightweight routing (alternative to React Router)
- **class-variance-authority**: Type-safe CSS variant management
- **tailwind-merge**: Intelligent Tailwind class merging
- **xlsx**: Excel file export functionality
- **jspdf** & **jspdf-autotable**: PDF export functionality

**Development Tools**
- **TypeScript**: Full-stack type safety with strict mode enabled
- **ESBuild**: Server-side bundling for production
- **tsx**: TypeScript execution for development server
- **Replit-specific plugins**: Runtime error overlay, cartographer, dev banner (development only)

**Audio Integration**
- Inline base64-encoded WAV for click sound effects (no external audio files)

## Recent Changes (November 2025)

### PWA Migration for Offline Operation
**Date**: November 1, 2025
**Motivation**: User requested zero-cost solution for friend's business - eliminating monthly server fees

**Changes Made**:
1. **Database Migration**: PostgreSQL → SQLite WASM (sql.js)
   - All data now stored in browser localStorage
   - Database persists as base64-encoded SQLite file
   - Automatic save after every data modification

2. **Architecture Shift**: Client-Server → Pure Client-Side
   - Removed all API endpoint calls
   - Direct database operations via `localDb.ts` abstraction layer
   - Express server only used for development (can be replaced with static hosting)

3. **PWA Implementation**:
   - Service Worker for offline caching
   - Web App Manifest for "Add to Home Screen"
   - Cache-first strategy for all static assets
   - Fully functional without internet after initial load

4. **Settings Management**:
   - Settings stored in localStorage (JSON)
   - Configurable: business day start hour, day/night prices, discount amount, foreigner price
   - Locker groups configuration persisted in SQLite

5. **Data Export**:
   - Excel (.xlsx) export for logs and sales data
   - PDF export available (Korean font limitations apply)

**Deployment Options**:
- Can be deployed as static files on any free hosting (GitHub Pages, Netlify, Vercel)
- Zero recurring costs after deployment
- Works offline on tablets/devices after first visit
- Data stays local to each device (no cloud sync)