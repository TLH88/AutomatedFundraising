# Funds 4 Furry Friends - Design System Quick Reference

## Overview
This document provides a quick reference for the **Funds 4 Furry Friends** design system. For complete details, see [DESIGN_BRIEF.md](./DESIGN_BRIEF.md).

---

## Visual Style
- **Theme:** Dark mode with skeuomorphic design + glassmorphism
- **Primary Accent:** Global brand color (#10B981) - symbolizing growth and hope
- **Mission:** Animal welfare fundraising and organization management
- **Feeling:** Warm, trustworthy, compassionate, professional

---

## Color Palette

### Backgrounds
```css
--bg-primary: #0A0A0A;
--bg-elevated: #141414;
--bg-card: #0F0F0F;
```

### Accents
```css
--accent-green: #10B981;
--accent-green-light: #34D399;
--accent-green-dark: #047857;
--accent-urgent: #F59E0B;
--accent-celebration: #EC4899;
```

### Text
```css
--text-primary: #FFFFFF;
--text-secondary: #D1D5DB;
--text-muted: #6B7280;
```

### Category Colors
```css
--category-dogs: #3B82F6;
--category-cats: #F59E0B;
--category-small-animals: #8B5CF6;
--category-medical: #EF4444;
--category-shelter: #10B981;
--category-education: #06B6D4;
```

---

## Typography

### Font Families
```css
--font-primary: "Nunito", "Poppins", "Inter", system-ui, sans-serif;
--font-numeric: "SF Mono", "JetBrains Mono", monospace;
```

### Font Sizes
```css
--text-h1: 32px;
--text-h2: 24px;
--text-h3: 20px;
--text-body-large: 16px;
--text-body: 14px;
--text-caption: 12px;
--text-small: 11px;

--numeric-large: 48px;
--numeric-medium: 32px;
--numeric-small: 20px;
```

### Font Weights
```css
--weight-regular: 400;
--weight-medium: 500;
--weight-semibold: 600;
--weight-bold: 700;
```

---

## Layout

### Grid System
- **Layout Type:** 3-column grid
- **Sidebar Width:** 280px
- **Topbar Height:** 80px
- **Content Padding:** 32px
- **Column Gap:** 24px
- **Aspect Ratio:** 16:10 (widescreen)

---

## Shadows

### Multi-layer Depth System
```css
/* Card Shadow */
box-shadow:
  0 20px 60px rgba(0,0,0,0.7),
  0 8px 24px rgba(0,0,0,0.5),
  inset 0 1px 0 rgba(255,255,255,0.05);

/* Button Shadow (with green glow) */
box-shadow:
  0 8px 24px rgba(16, 185, 129, 0.3),
  0 4px 12px rgba(0,0,0,0.6),
  inset 0 1px 0 rgba(255,255,255,0.2);

/* Pressed State */
box-shadow:
  inset 0 4px 12px rgba(0,0,0,0.6),
  0 2px 8px rgba(0,0,0,0.4);

/* Hover State */
box-shadow:
  0 24px 72px rgba(0,0,0,0.8),
  0 12px 32px rgba(0,0,0,0.6);
```

---

## Glassmorphism Effects

```css
background: rgba(255, 255, 255, 0.05);
backdrop-filter: blur(40px) saturate(180%);
border: 1px solid rgba(255, 255, 255, 0.1);
```

---

## Border Radius

```css
--radius-card: 20px;
--radius-button: 12px;
--radius-pill: 999px;
--radius-input: 12px;
--radius-small: 8px;
--radius-animal-image: 16px;
```

---

## Components

### Primary Button (Donation/Action)
```css
background: linear-gradient(135deg, #10B981, #059669);
color: #FFFFFF;
border-radius: 12px;
padding: 14px 28px;
box-shadow: [button shadow with green glow];
```

**Hover:**
- Brightness increase (+10%)
- Elevation increase
- Scale: 1.02

### Secondary Button (Glass)
```css
background: rgba(255, 255, 255, 0.08);
backdrop-filter: blur(20px);
border: 1px solid rgba(255, 255, 255, 0.12);
color: #10B981;
border-radius: 12px;
padding: 14px 28px;
```

### Urgent Button (Campaigns needing attention)
```css
background: linear-gradient(135deg, #F59E0B, #D97706);
color: #FFFFFF;
border-radius: 12px;
padding: 14px 28px;
```

### Cards
```css
background: #0F0F0F;
border-radius: 20px;
padding: 32px;
box-shadow: [card shadow];
```

### Progress Bars
```css
height: 8px;
border-radius: 999px;
background: rgba(255, 255, 255, 0.1);
fill: linear-gradient(90deg, #10B981, #34D399);
```

**Features:**
- Percentage label above bar (green)
- Heart icons at milestone percentages
- Inner shadow + outer glow

### Input Fields
```css
background: rgba(255, 255, 255, 0.05);
border: 1px solid rgba(255, 255, 255, 0.1);
border-radius: 12px;
padding: 14px 16px;
color: #FFFFFF;
```

**Focus:**
```css
border-color: #10B981;
box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.3);
```

### Tags/Pills (Categories)
```css
background: rgba(16, 185, 129, 0.15);
border: 1px solid rgba(16, 185, 129, 0.3);
border-radius: 999px;
padding: 6px 14px;
color: #10B981;
font-size: 12px;
```

---

## Animations & Transitions

### Timing Functions
```css
--ease-default: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bouncy: cubic-bezier(0.68, -0.55, 0.265, 1.55);
--ease-smooth: cubic-bezier(0.25, 0.46, 0.45, 0.94);
```

### Micro-interactions
- **Button press:** scale(0.98) + inset shadow (150ms)
- **Card hover:** elevation increase (300ms)
- **Donation submit:** heart animation (500ms)
- **Number changes:** counting animation + green glow (600ms)
- **Progress bars:** smooth fill animation (800ms)

### Celebratory Animations
- **Milestone reached:** Confetti + scale pulse
- **New donation:** Gentle heartbeat animation
- **Goal achieved:** Green glow pulse + success message
- **Thank you sent:** Heart flies from button

---

## Icons

### Style
- **Type:** Soft rounded fills (skeuomorphic, friendly)
- **Size:** 22px (sidebar), 18px (general)
- **Active color:** #10B981
- **Inactive color:** #6B7280

### Common Icons
- 🐾 Animals/Impact
- 💚 Donations/Heart
- 🎯 Goals/Targets
- 📊 Analytics
- 🏆 Success Stories
- 📅 Events
- 🏠 Shelter/Home

---

## Chart Styling

### Line Chart (Fundraising Progress)
```css
--line-color: #10B981;
--line-width: 3px;
--fill-gradient: linear-gradient(180deg, rgba(16, 185, 129, 0.3), transparent);
--grid-color: rgba(255, 255, 255, 0.05);
--goal-line: dashed 2px rgba(52, 211, 153, 0.6);
```

**Features:**
- Smooth curved lines
- Green gradient fill beneath
- Interactive tooltips (glass container)
- Milestone markers (hearts on significant donations)
- Hover: glowing dot on data points

---

## Table Styling

### Recent Donations Table
```css
--row-height: 64px;
--divider-color: rgba(255, 255, 255, 0.08);
--hover-bg: rgba(255, 255, 255, 0.03);
```

**Features:**
- Circular donor avatars with soft shadows
- Amount displayed prominently in green
- Category badges with colored backgrounds
- Special icons:
  - ❤️ Recurring donors
  - ⭐ Major gifts ($1000+)
  - 🎂 Anniversary badges

---

## Sidebar Navigation

### Dimensions
- Width: 280px
- Item height: 48px
- Item border radius: 12px
- Padding: 12px 16px
- Margin between items: 4px

### Active State
```css
background: soft green gradient;
border-left: 3px solid #10B981;
box-shadow:
  0 4px 12px rgba(0,0,0,0.6),
  inset 0 0 20px rgba(16, 185, 129, 0.3);
```

---

## Accessibility

### Contrast Ratios
- Body text: 4.5:1 minimum
- Donation amounts: 7:1 minimum
- Interactive elements: clearly visible focus indicators

### Focus Indicators
```css
outline: 2px solid #10B981;
outline-offset: 2px;
box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.3);
```

### Responsive Breakpoints
- **Desktop:** 1440px+ (primary target)
- **Laptop:** 1024px - 1439px (sidebar → icons only)
- **Tablet:** 768px - 1023px (2-column layout)
- **Mobile:** < 768px (single column + bottom nav)

---

## Content & Messaging

### Voice & Tone
- Warm and grateful
- Impact-focused
- Transparent
- Hopeful
- Personal

### Sample Micro-copy
- **Empty state:** "Start your first campaign and watch the magic happen"
- **Success:** "Thank you! Your generosity will help X animals"
- **Loading:** "Calculating your impact..."
- **Error:** "Oops! Let's try that again"

---

## Special Features

### Donor Recognition Tiers
1. **Friend** (first donation)
2. **Supporter** ($100+ total)
3. **Champion** ($500+ total)
4. **Hero** ($1000+ total)

### Trust Indicators
- Charity ratings/certifications
- Security badges for payments
- Team photos and bios
- Physical location/contact info
- Transparent fund allocation breakdown

---

## Implementation Notes

1. **Always use design tokens** from [design-tokens.json](./design-tokens.json)
2. **Layer shadows properly** for depth perception
3. **Apply glassmorphism** to overlays and modal backgrounds
4. **Use green accents strategically** for CTAs and success states
5. **Include paw print watermarks** subtly in backgrounds
6. **Animate milestone achievements** for celebration and engagement
7. **Maintain warm, friendly tone** throughout copy and interactions

---

For complete specifications and detailed implementation guidance, refer to:
- [DESIGN_BRIEF.md](./DESIGN_BRIEF.md) - Full design specification
- [design-tokens.json](./design-tokens.json) - Design tokens for development

---

**Last Updated:** February 22, 2026
**Version:** 1.0
**Project:** Funds 4 Furry Friends - Non-Profit Fundraising Platform
