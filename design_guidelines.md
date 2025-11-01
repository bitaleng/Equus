# Design Guidelines: Bathhouse Locker Management System

## Design Approach

**Selected Approach:** Design System (Material Design principles adapted for touch-based business applications)

**Justification:** This is a utility-focused productivity tool requiring efficiency, learnability, and information clarity. The application serves counter staff who need quick, reliable access to locker status, customer data, and sales metrics. Material Design's emphasis on clear hierarchy, responsive touch targets, and structured data presentation aligns perfectly with these operational needs.

**Key Design Principles:**
- Touch-first interaction design with generous tap targets
- Clear visual hierarchy for rapid information scanning
- High-contrast status indicators for instant locker availability recognition
- Efficient spatial organization for dual-panel split layout
- Tactile feedback through animations and sound

---

## Core Design Elements

### A. Typography

**Font Family:** 
- Primary: Inter or Roboto (via Google Fonts CDN)
- Fallback: system-ui, sans-serif

**Type Scale:**
- Display/Headers: 24px, font-weight 600
- Section Titles: 18px, font-weight 600
- Body Text: 14px, font-weight 400
- Table Data: 13px, font-weight 400
- Button Text: 15px, font-weight 500
- Small/Meta: 12px, font-weight 400

**Line Heights:**
- Headers: 1.2
- Body: 1.5
- Tables: 1.4

---

### B. Layout System

**Viewport Structure:**
- Full-width split layout: 40% left panel / 60% right panel
- Left panel subdivided: 60% Today Status (top) / 40% Sales Summary (bottom)
- Right panel: Full-height locker grid with header

**Spacing Primitives (Tailwind units):**
- Primary spacing set: 2, 4, 6, 8
- Common patterns:
  - Component padding: p-4 or p-6
  - Section gaps: gap-4
  - Grid spacing: gap-2
  - Button padding: px-4 py-2 or px-6 py-3
  - Panel margins: m-4 or m-6

**Container Structure:**
- Max container width: Full viewport
- Panel borders: 1px solid dividers
- Inner content padding: p-6 for panels, p-4 for cards

**Grid System:**
- Locker grid: 8 columns × 10 rows (grid-cols-8)
- Consistent gap-2 between buttons
- Responsive scaling for different screen sizes

---

### C. Component Library

#### 1. Navigation/Header Components

**Top App Bar:**
- Height: h-16
- Contains: System title, current date/time, admin controls
- Padding: px-6
- Fixed position for persistent visibility
- Typography: 18px semibold for title, 14px for metadata

#### 2. Core UI Elements

**Locker Buttons (80 total):**
- Size: Square aspect ratio, minimum 56px × 56px tap target
- Border radius: rounded-lg (8px)
- Border: 2px solid
- States:
  - Empty: Subtle border, light background
  - In-use: Filled solid, prominent styling
  - Disabled (빈락카): Diagonal striped pattern, reduced opacity
- Label: Centered locker number, 16px medium weight
- Interaction: Scale animation (0.95 on press), click sound effect

**Modal/Popup (Option Selection):**
- Width: 400px fixed
- Padding: p-6
- Border radius: rounded-xl (12px)
- Shadow: Strong elevation (8-12px blur)
- Backdrop: Semi-transparent overlay
- Header: 18px semibold title with close button
- Content sections clearly separated with spacing

**Option Selection Buttons:**
- Radio button group layout
- Each option: Full-width, h-12, px-4
- Border radius: rounded-lg
- Selected state: Filled background
- Hover state: Subtle background shift

**Action Buttons:**
- Primary (Apply): Large, px-6 py-3, rounded-lg, 15px semibold
- Secondary (Cancel, Close): Ghost or outlined style
- Destructive (Cancel Entry): Outlined with warning indication
- Exit (퇴실): Prominent success-styled button
- Minimum tap target: 44px height

**Input Fields (Direct Entry):**
- Height: h-12
- Padding: px-4
- Border radius: rounded-lg
- Border: 2px
- Focus state: Enhanced border, focus ring
- Label: 12px above input
- Numeric keyboard for touch devices

#### 3. Data Display Components

**Today Status Table:**
- Header row: 14px semibold, slight background fill
- Data rows: 13px regular, alternating subtle backgrounds
- Row height: h-12 minimum
- Columns: Locker #, Entry Time, Rate, Option, Amount, Notes
- Padding: px-4 py-3 per cell
- Borders: Bottom borders only for clarity
- Scroll: Vertical overflow-y-auto with max-height

**Sales Summary Cards:**
- Card container: p-6, rounded-lg
- Metric layout: Grid (2 columns)
- Each metric:
  - Label: 12px uppercase, tracking-wide
  - Value: 24px semibold
  - Spacing: gap-1 between label and value
- Grid gap: gap-4 between metrics

**Status Indicators:**
- Badges for quick status: Small rounded-full pills
- Size: px-3 py-1
- Typography: 11px medium, uppercase
- Positioned near relevant data

#### 4. Feedback & Interaction

**Loading States:**
- Skeleton screens for initial load
- Spinner for async operations
- Subtle pulse animations

**Animations:**
- Locker button press: Scale to 0.95, duration 100ms
- Modal entry: Fade + scale from 0.95, duration 200ms
- Status changes: Smooth 300ms transitions
- NO excessive decorative animations

**Audio Feedback:**
- Click sound: Short, crisp audio file (<50ms)
- Triggered via Web Audio API
- Volume: 50% of system volume

#### 5. Utility Components

**Checkbox (빈락카 Feature):**
- Size: 20px × 20px
- Border radius: rounded (4px)
- Checkmark: Bold stroke
- Label: 14px, ml-2
- Positioned in panel header or settings area

**Date/Time Display:**
- Format: Clear, localized (Korean)
- Typography: 14px regular
- Auto-updating every minute

---

## Accessibility Implementation

- **Touch Targets:** Minimum 44px × 44px for all interactive elements (locker buttons minimum 56px)
- **Contrast:** WCAG AA compliant text contrast ratios
- **Focus States:** Visible 2px focus rings on all interactive elements
- **Keyboard Navigation:** Full keyboard support for non-touch devices
- **Screen Reader:** Proper ARIA labels for all buttons and status indicators
- **Error Messages:** Clear, actionable error text when validation fails

---

## Responsive Behavior

**Desktop (1280px+):**
- Full split-panel layout as specified
- 8-column locker grid

**Tablet (768px - 1279px):**
- Maintain split layout but adjust proportions (45% / 55%)
- Reduce locker button size proportionally
- Maintain 8-column grid

**Mobile (<768px):**
- Stack panels vertically: Status → Summary → Locker Grid
- Locker grid adapts to 4-6 columns
- Modal popups fill 90% of viewport width

---

## Performance Considerations

- **Icons:** Use Material Icons or Heroicons via CDN
- **Fonts:** Google Fonts with font-display: swap
- **Audio:** Preload click sound effect (small file size <10KB)
- **Animations:** CSS transforms (GPU-accelerated)
- **Data Updates:** Efficient real-time updates without full reloads

---

## Panel-Specific Layouts

**Left Top (Today Status):**
- Header: Title + count badge
- Table: Scrollable list, sticky header
- Max height: calc(60vh - header)

**Left Bottom (Sales Summary):**
- Header: Date display
- 2-column metric grid
- Compact spacing for dense information

**Right (Locker Grid):**
- Header: "Locker Status" + 빈락카 controls
- 8×10 grid fills available space
- Centered with max-width constraint
- Bottom padding for comfortable scrolling

This design creates a professional, efficient, touch-optimized interface that prioritizes operational speed and clarity for bathhouse counter staff.