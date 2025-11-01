# Bathhouse Locker Management System

## Overview

This is a locker management system designed for bathhouse (목욕탕) operations. The application helps counter staff digitize the manual ledger process, allowing them to track customer check-ins, locker assignments, pricing options, and daily sales with simple touch/click interactions. The system replaces paper-based record-keeping with an efficient digital interface optimized for touch-based devices.

**Core Purpose**: Transform the traditional paper notebook workflow into a streamlined digital system where staff can record locker assignments, entry times, pricing options (including discounts and foreigner rates), and manage checkouts with minimal clicks.

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
- **TanStack Query (React Query)** for server state management, caching, and automatic refetching
- Local component state with React hooks for UI interactions
- 5-second polling interval for active locker data to ensure real-time updates

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

### Backend Architecture

**Server Framework**
- **Express.js** with TypeScript running on Node.js
- RESTful API design for CRUD operations on locker entries and daily summaries
- Custom middleware for request logging and JSON body parsing

**Business Logic Layer**
- **Business Day Calculation**: Custom logic treating 10:00 AM as the day boundary (sales aggregated from 10 AM to 9:59 AM next day)
- **Time-based Pricing**: Automatic day/night rate calculation (주간 7AM-7PM: ₩10,000 / 야간 7PM-7AM: ₩13,000)
- **Korea Standard Time (KST)**: All datetime operations use Asia/Seoul timezone via `date-fns-tz` to ensure consistency across development and production environments
- **Shared Logic**: Common business rules (pricing, time calculations) exported from `shared/businessDay.ts` for use in both client and server

**API Endpoints**
- `POST /api/entries`: Create new locker entry (입실)
- `PATCH /api/entries/:id`: Update entry for options, checkout (퇴실), or cancellation
- `GET /api/lockers/active`: Fetch currently occupied lockers
- `GET /api/logs`: Retrieve historical entries with optional date filtering
- `GET /api/summary/:businessDay`: Fetch daily sales summary

**Key Architectural Patterns**
- Repository pattern via `storage.ts` abstraction layer for data access
- Zod schema validation for type-safe request/response handling
- Automatic summary recalculation on entry updates (checkout/cancellation)
- Shared TypeScript types between client and server via `@shared` path alias

### Data Storage & Schema

**Database Technology**
- **PostgreSQL** via Neon serverless with WebSocket connections
- **Drizzle ORM** for type-safe database queries and schema management
- **Connection Pooling** through `@neondatabase/serverless` with WebSocket support for serverless environments

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
- Entry creation → Auto-populate business day, time type, base price based on entry timestamp
- Option selection → Calculate final price (foreigner overrides to ₩25,000, discounts subtract from base)
- Checkout/cancellation → Trigger summary recalculation for affected business day
- Daily summary queries use business day (10 AM boundary) rather than calendar day

### External Dependencies

**Third-Party Services**
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Google Fonts CDN**: Inter and Roboto font families for typography

**Key NPM Packages**
- **@radix-ui/***: Headless UI component primitives (18+ components)
- **date-fns** & **date-fns-tz**: Date manipulation and timezone handling (Asia/Seoul)
- **drizzle-orm** & **drizzle-zod**: Database ORM and schema-to-Zod validation
- **react-hook-form** & **@hookform/resolvers**: Form state management
- **wouter**: Lightweight routing (alternative to React Router)
- **class-variance-authority**: Type-safe CSS variant management
- **tailwind-merge**: Intelligent Tailwind class merging

**Development Tools**
- **TypeScript**: Full-stack type safety with strict mode enabled
- **ESBuild**: Server-side bundling for production
- **tsx**: TypeScript execution for development server
- **Replit-specific plugins**: Runtime error overlay, cartographer, dev banner (development only)

**Audio Integration**
- Inline base64-encoded WAV for click sound effects (no external audio files)