# Design Brief: Funds 4 Furry Friends - Non-Profit Fundraising Dashboard

## Overview
You are an experienced UI designer embracing modern, skeuomorphic design principles with deep shadows, glass morphism effects, and soft, harmonious colors.

Your task is to write a new specification for a **non-profit fundraising app called "Funds 4 Furry Friends"**.

---

## 1. Overall Style & Visual Language

This interface represents a warm, engaging non-profit fundraising dashboard using a dark theme with **skeuomorphic design principles**, **glassmorphism**, and **soft, compassionate aesthetics**.

### Core characteristics:
- **Green accent highlights** (emerald, mint, forest tones) symbolizing growth and hope
- **Deep, layered shadows** creating realistic depth
- **Frosted glass effects** with blur and translucency
- **Soft, rounded elements** mimicking physical objects
- **Subtle textures** and gradients
- **Warm, welcoming color transitions**
- **Animal-friendly imagery** and iconography

### Visual effects:
- Multi-layer shadow depth (inset + outer)
- Backdrop blur on glass surfaces
- Soft gradients on interactive elements
- Subtle noise/grain textures
- Light reflection highlights on raised surfaces
- Heartwarming visual touches (paw prints, hearts)

### Target perception:
- **Trustworthy** and transparent
- **Compassionate** and mission-driven
- **Professional** yet approachable
- **Impact-focused** with clear progress tracking

---

## 2. Layout Structure

### Global Layout
- Desktop-first dashboard
- Output proportions: **16:10** (widescreen optimized)
- Three main regions:
  1. **Top navigation bar** (horizontal, glass effect)
  2. **Left sidebar navigation** (vertical, elevated surface)
  3. **Main content area** (3-column grid with staggered cards)

### Spacing philosophy:
- Generous padding (24-32px between major sections)
- Breathing room around impact metrics
- Asymmetric layouts for visual interest
- Content hierarchy through elevation and shadow depth

---

## 3. Top Navigation Bar

### Dimensions & Style
- Height: **80px**
- Background: **Frosted glass** with backdrop blur
- Border bottom: Subtle 1px green glow
- Shadow: Deep, soft shadow beneath

### Content Layout
**Left section:**
- Brand wordmark **"Funds 4 Furry Friends"**
- Custom logotype with friendly, rounded font
- Small paw print icon in green
- Subtle embossed effect

**Center section:**
- Navigation links: Dashboard, Campaigns, Donors, Analytics, Impact Reports
- Pill-shaped hover states with glass effect
- Active state: soft green inner glow

**Right section:**
- Search input (glass capsule with icon)
- Notifications bell (with green badge showing new donations)
- Primary CTA: **"New Campaign"** (raised green button with shadow)
- User profile avatar (circular, soft shadow, green ring when active)
- Settings icon

### Typography:
- Font: Warm, friendly sans-serif (Nunito, Poppins, or similar)
- Weight: 500 for nav items, 700 for brand
- Color: Pure white (#FFFFFF) with 95% opacity
- Inactive: 60% opacity

---

## 4. Left Sidebar Navigation

### Dimensions & Style
- Width: **280px**
- Background: Elevated dark surface (#0F0F0F)
- Deep outer shadow creating floating effect
- Subtle inner edge highlight (top-left)

### Navigation Structure
**Vertical menu items with icons:**
- 🏠 Dashboard (active)
- 🎯 Active Campaigns
- 💚 Donors & Sponsors
- 📊 Analytics & Reports
- 🐾 Animals Helped
- 📅 Events Calendar
- 📧 Communications
- 🏆 Success Stories

**Bottom-aligned section:**
- ⚙️ Settings
- 👥 Team Management
- ℹ️ Help & Resources

### Active state styling:
- Soft green gradient background (subtle)
- Raised appearance with layered shadows:
  - Outer: 0 4px 12px rgba(0,0,0,0.6)
  - Inner highlight: soft green glow
- Left border accent (3px solid green)
- Icon color shift to bright green
- Subtle paw print watermark

### Icon system:
- Style: Soft rounded fills (skeuomorphic, friendly)
- Size: 22px
- Active color: #10B981 (emerald green)
- Inactive color: #6B7280 (muted gray)
- Animal-themed icons where appropriate

### Container details:
- Each item: 48px height
- Border radius: 12px
- Padding: 12px 16px
- Margin between items: 4px

---

## 5. Main Content Area

The main area uses a **3-column responsive grid** with cards of varying heights creating visual rhythm.

### 5.1 Mission Impact Overview Card
**Position:** Full-width header card spanning all 3 columns

**Layout:**
- Left section:
  - Greeting text: "Welcome back, [Name]"
  - Subtitle: "Together we're making a difference"
  - Small icon: Calendar showing today's date

- Center section (primary focus):
  - Label: "Total Funds Raised"
  - Large numeric display: **$XX,XXX**
  - Secondary metric: "XX Animals Helped This Month"
  - Progress indicator (green if on track, with heart icon)
  - Small text: "XX% toward annual goal"

- Right section:
  - Quick action buttons (glass pills):
    - "Record Donation"
    - "Start Campaign"
    - "Share Impact"

**Visual style:**
- Deep shadow creating floating effect
- Subtle gradient background (dark to slightly lighter)
- Frosted glass overlay on quick action area
- Soft green accent line at bottom
- Subtle paw print pattern in background

---

### 5.2 Fundraising Progress Chart Card
**Position:** Column 1-2 (spans 2 columns), top row

**Content:**
- Card title: "Fundraising Trends"
- Time range selector (1M, 3M, 6M, 1Y, All) with glass pill selection
- Campaign filter dropdown
- **Line chart** showing fundraising progress over time:
  - Smooth curved lines
  - Green gradient fill beneath line (opacity fade)
  - Interactive tooltips on hover (glass container showing date + amount)
  - Grid lines (subtle, low opacity)
  - Y-axis: dollar amounts
  - X-axis: time periods
  - Goal line (dashed, lighter green)
  - Milestone markers (hearts on significant donations)

**Chart styling:**
- Line color: Bright green (#10B981)
- Line weight: 3px with soft shadow
- Fill gradient: Green to transparent
- Background: Dark with subtle grid pattern
- Hover states: Glowing dot on data point with donation details
- Goal line: Dashed green (#34D399, opacity 60%)

**Card style:**
- Deep layered shadow
- Rounded corners: 20px
- Padding: 32px
- Background: Slightly elevated dark (#141414)

---

### 5.3 Total Gains/Impact Card
**Position:** Column 3, top row

**Content:**
- Icon: Growing plant or paw print (green)
- Label: "Monthly Impact"
- Large number: **$X,XXX** raised
- Secondary metric: **XX** animals helped
- Percentage: **+XX%** vs. last month
- Time period: "This month"
- Small sparkline showing donation trend

**Visual hierarchy:**
- Large numeric value (36px)
- Color-coded progress:
  - On track: Green (#10B981) with upward arrow
  - Behind goal: Soft amber (#F59E0B) with neutral indicator
- Sparkline embedded at bottom
- Small animal illustration silhouette

**Card treatment:**
- Raised appearance with deep shadow
- Subtle green glow for positive progress
- Glass overlay effect on top edge
- Rounded: 20px
- Inspirational micro-copy at bottom

---

### 5.4 Recent Donations Table
**Position:** Column 1-2 (spans 2 columns), middle row

**Structure:**
- Card title: "Recent Donations"
- Filter/sort controls (glass buttons): All, One-time, Recurring, Major Gifts
- Quick stats: Total donations today, Average gift size
- **Table with columns:**
  1. **Donor Name** (with avatar or icon)
  2. **Campaign/Purpose** (with category badge)
  3. **Amount** (highlighted in green)
  4. **Date & Time** (formatted)
  5. **Type** (One-time, Monthly, etc.)
  6. **Action** (send thank you, view profile)

**Table styling:**
- Row height: 64px
- Dividers: Subtle 1px line with 20% opacity
- Hover state: Soft elevated effect with slight background lightening
- Alternating row backgrounds for depth
- Donor avatars/icons in circular containers with soft shadows
- Amount displayed prominently in green

**Category badges:**
- 🐕 Dogs (blue background)
- 🐱 Cats (orange background)
- 🐰 Small Animals (purple background)
- 🏥 Medical Fund (red background)
- 🏠 Shelter Support (green background)
- 🎓 Education (teal background)

**Category icon containers:**
- Size: 40px circle
- Soft shadow beneath
- Slightly raised appearance
- Colored background with icon in white

**Special touches:**
- Heart icon for recurring donors
- Star icon for major gifts ($1000+)
- Anniversary badge for long-time supporters

---

### 5.5 Latest News & Updates Card
**Position:** Column 3, middle row

**Content:**
- Card title: "Recent Updates"
- Vertical list of announcements (3-4 visible):
  - Small thumbnail image (animal photo or event)
  - Headline (2 lines max)
  - Category badge (Success Story, Event, Alert, etc.)
  - Timestamp
  - Subtle separator between items

**Content types:**
- Success stories (animal adoptions)
- Campaign updates
- Upcoming events
- Volunteer spotlights
- Impact milestones

**Interaction:**
- Each item clickable
- Hover: Slight elevation increase
- "View all updates" link at bottom (green text)
- Heart icon to mark as favorite

**Card styling:**
- Compact vertical spacing
- Images with rounded corners (8px)
- Soft shadows on image elements
- Glass dividers between news items
- Warm, inviting imagery

---

### 5.6 Campaign Performance Mini Cards
**Position:** Bottom row, distributed across 3 columns

**Three small cards showing:**

1. **Active Campaigns**
   - Icon: Target/bullseye
   - Number of active campaigns
   - Top performer highlighted
   - "View all" link

2. **Donor Retention**
   - Icon: Heart with arrow
   - Retention percentage
   - Progress bar (green gradient fill)
   - Monthly vs. yearly comparison

3. **Upcoming Events**
   - Icon: Calendar with paw
   - Count of upcoming events
   - Next event name + date
   - RSVP count

**Mini card styling:**
- Size: Equal width within columns
- Height: 140px
- Soft shadows with depth
- Icon in top-left with colored circular background
- Large numeric value or key metric
- Supporting text beneath
- Subtle hover animation

---

## 6. Color Palette

### Primary Colors
- **Background (darkest):** #0A0A0A
- **Elevated surfaces:** #141414, #1A1A1A
- **Card backgrounds:** #0F0F0F with gradient overlays

### Accent Colors (Nature-inspired greens)
- **Primary green:** #10B981 (emerald - growth, hope)
- **Secondary green:** #34D399 (lighter mint - freshness)
- **Dark green:** #047857 (forest - stability)
- **Green glow:** rgba(16, 185, 129, 0.3)

### Supporting Accent Colors
- **Warm orange:** #F59E0B (urgent campaigns, alerts)
- **Soft blue:** #3B82F6 (informational)
- **Purple:** #8B5CF6 (events, special programs)
- **Rose:** #EC4899 (love, compassion)

### Text Hierarchy
- **Primary text:** #FFFFFF (100% opacity)
- **Secondary text:** #D1D5DB (82% opacity)
- **Muted/disabled:** #6B7280 (60% opacity)

### Semantic Colors
- **Success/Goal Met:** #10B981 (green)
- **Alert/Urgent:** #F59E0B (amber - softer than red)
- **Info:** #3B82F6 (blue)
- **Celebration:** #EC4899 (pink)
- **Neutral:** #8B5CF6 (purple)

### Glass Effect Colors
- **Glass background:** rgba(255, 255, 255, 0.05)
- **Glass border:** rgba(255, 255, 255, 0.1)
- **Glass highlight:** linear-gradient(rgba(255,255,255,0.1), transparent)

---

## 7. Effects & Interaction

### Shadow System (Multi-layer depth)
```css
/* Elevated card */
box-shadow:
  0 20px 60px rgba(0,0,0,0.7),
  0 8px 24px rgba(0,0,0,0.5),
  inset 0 1px 0 rgba(255,255,255,0.05);

/* Raised button (donation/action) */
box-shadow:
  0 8px 24px rgba(16, 185, 129, 0.3),
  0 4px 12px rgba(0,0,0,0.6),
  inset 0 1px 0 rgba(255,255,255,0.2);

/* Pressed/Active */
box-shadow:
  inset 0 4px 12px rgba(0,0,0,0.6),
  0 2px 8px rgba(0,0,0,0.4);
```

### Glassmorphism
```css
background: rgba(255, 255, 255, 0.05);
backdrop-filter: blur(40px) saturate(180%);
border: 1px solid rgba(255, 255, 255, 0.1);
```

### Border Radius
- **Cards:** 20px
- **Buttons:** 12px (pill buttons: 999px)
- **Input fields:** 12px
- **Small elements:** 8px
- **Avatars/circles:** 50%
- **Animal image cards:** 16px (friendly, soft)

### Hover States
- Subtle elevation increase (shadow depth +20%)
- Slight scale transform: `scale(1.02)`
- Background lightening: +5% brightness
- Green glow on interactive elements
- Smooth transitions: `all 0.3s cubic-bezier(0.4, 0, 0.2, 1)`
- Subtle paw print appears on major action buttons

### Focus States
- Green outline: 2px solid with glow
- Increased shadow depth
- Slight scale increase
- Accessibility-first design

### Active/Pressed States
- Inset shadow (pressed appearance)
- Scale down: `scale(0.98)`
- Brightness reduction: -10%
- Haptic feedback (if supported)

---

## 8. Typography Scale

### Font Family
- **Primary:** "Nunito" / "Poppins" / "Inter" (warm, friendly)
- **Headings:** "Nunito Bold" / "Poppins SemiBold"
- **Numeric:** "SF Mono" / "JetBrains Mono" (for precise donation figures)

### Hierarchy
```
H1 (Page title): 32px, weight 700
H2 (Card title): 24px, weight 600
H3 (Section): 20px, weight 600
Body Large: 16px, weight 500
Body: 14px, weight 400
Caption: 12px, weight 400
Small: 11px, weight 500

Numeric Display (Donations):
  Large: 48px, weight 700, monospace
  Medium: 32px, weight 600, monospace
  Small: 20px, weight 600, monospace
```

### Special Typography
- **Impact statements:** Italic, weight 500, green color
- **Donor names:** Weight 600, slightly larger
- **Campaign goals:** Bold, emphasized
- **Success metrics:** Green color, bold

---

## 9. Component Library

### Buttons

**Primary (Donation/Action Green):**
```css
background: linear-gradient(135deg, #10B981, #059669);
color: #FFFFFF;
border-radius: 12px;
padding: 14px 28px;
shadow: multi-layer with green glow;
hover: brightness increase + elevation;
icon: heart or paw print (optional);
```

**Secondary (Glass):**
```css
background: rgba(255, 255, 255, 0.08);
backdrop-filter: blur(20px);
border: 1px solid rgba(255, 255, 255, 0.12);
color: #10B981;
hover: green tint;
```

**Urgent Action (Amber for campaigns needing attention):**
```css
background: linear-gradient(135deg, #F59E0B, #D97706);
color: #FFFFFF;
icon: alert or clock;
```

**Icon buttons:**
```css
40px × 40px circular;
glass background;
centered icon (heart, share, etc.);
soft shadow;
```

### Input Fields
```css
background: rgba(255, 255, 255, 0.05);
border: 1px solid rgba(255, 255, 255, 0.1);
border-radius: 12px;
padding: 14px 16px;
focus: green border + glow;
placeholder: soft gray, friendly tone;
```

### Progress Bars (Campaign/Goal Progress)
```css
height: 8px;
border-radius: 999px;
background: rgba(255, 255, 255, 0.1);
fill: linear-gradient(90deg, #10B981, #34D399);
shadow: inner shadow + outer glow;
percentage label: above bar, green;
milestone markers: hearts at key percentages;
```

### Pills/Tags (Campaign Categories)
```css
background: rgba(16, 185, 129, 0.15);
border: 1px solid rgba(16, 185, 129, 0.3);
border-radius: 999px;
padding: 6px 14px;
color: #10B981;
font-size: 12px;
icon: category icon (paw, heart, etc.);
```

### Donation Cards
```css
border-radius: 16px;
padding: 24px;
background: elevated with gradient;
donor avatar: circular, top-left;
amount: large, green, emphasized;
thank you button: glass, prominent;
recurring badge: special treatment;
```

### Impact Badges
```css
circular or shield-shaped;
colored background based on achievement;
icon in center (star, heart, paw);
subtle animation on hover;
displayed on donor profiles;
```

---

## 10. Accessibility & Responsiveness

### Accessibility
- Minimum contrast ratio: 4.5:1 for body text, 7:1 for donation amounts
- Focus indicators visible on all interactive elements
- Keyboard navigation support throughout
- Screen reader labels on all icons and interactive elements
- Color not sole indicator of meaning (icons + text)
- Alt text for all animal images
- Clear error states with helpful messaging

### Responsive Breakpoints
- Desktop: 1440px+ (primary)
- Laptop: 1024px - 1439px (sidebar collapses to icons)
- Tablet: 768px - 1023px (2-column layout)
- Mobile: < 768px (single column, bottom navigation)

### Mobile Considerations
- Larger touch targets (min 48px)
- Simplified charts for small screens
- Sticky donation CTA
- Swipe gestures for table navigation

---

## 11. Animation Principles

### Micro-interactions
- Button press: scale down + inset shadow (150ms)
- Card hover: elevation increase (300ms)
- Donation submission: heart animation (500ms)
- Number changes: counting animation with green glow (600ms)
- Progress bar fills: smooth animation (800ms)

### Celebratory Animations
- Milestone reached: confetti + scale pulse
- New donation: gentle heartbeat animation
- Goal achieved: green glow pulse + success message
- Thank you sent: heart flies from button

### Page transitions
- Fade in content cards staggered (100ms delay each)
- Chart lines draw in on load (1000ms)
- Skeleton loaders with shimmer effect
- Smooth scroll to sections

### Easing
- Standard: `cubic-bezier(0.4, 0, 0.2, 1)`
- Bouncy (celebrations): `cubic-bezier(0.68, -0.55, 0.265, 1.55)`
- Smooth: `cubic-bezier(0.25, 0.46, 0.45, 0.94)`
- Heartbeat: Custom spring animation

---

## 12. Content & Messaging Tone

### Voice & Tone
- **Warm and grateful** - always appreciative
- **Impact-focused** - show real results
- **Transparent** - clear about fund usage
- **Hopeful** - inspire continued support
- **Personal** - recognize individual contributions

### Key Messages
- Every donation makes a difference
- Your support saves lives
- Join our community of animal lovers
- See your impact in real-time
- Together we're stronger

### Micro-copy Examples
- Empty states: "Start your first campaign and watch the magic happen"
- Success messages: "Thank you! Your generosity will help X animals"
- Loading states: "Calculating your impact..."
- Error states: "Oops! Let's try that again"

---

## 13. Special Features for Non-Profit Context

### Transparency Elements
- Fund allocation breakdown (% to animals vs. operations)
- Real-time donation counter
- Impact metrics prominently displayed
- Animal success stories with photos
- Financial reports easily accessible

### Donor Recognition
- Tiered donor badges (Friend, Supporter, Champion, Hero)
- Public donor wall (with permission)
- Anniversary celebrations
- Recurring donor special treatment
- Major gift acknowledgment

### Emotional Connection
- Before/after animal photos
- Adoption update notifications
- Personal thank you messages
- Impact stories tied to donations
- Community highlights

### Trust Indicators
- Charity ratings/certifications displayed
- Security badges for payments
- Privacy policy easily accessible
- Team photos and bios
- Physical location/contact info

---

This specification creates a **compassionate, trustworthy, and impact-focused** fundraising dashboard that feels warm and professional through skeuomorphic design principles combined with modern glassmorphism, while maintaining the mission-driven nature of non-profit animal welfare work.
