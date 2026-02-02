# YAHAML UI Design System - Compact & Flexible

## Overview

The YAHAML UI has been completely redesigned for **compactness**, **density**, and **flexibility**. This system prioritizes information density while maintaining clarity and usability, essential for logging screens with lots of data.

## Key Principles

1. **Compact**: Minimal padding, smaller gaps, tight layouts
2. **Flexible**: Responsive grids, adapts to various screen sizes
3. **Themeable**: Light/Dark/Auto theme support with persistent preference
4. **Accessible**: Clear hierarchy, proper contrast, keyboard-friendly
5. **Performance**: Efficient CSS with CSS custom properties

## Spacing System

All spacing uses CSS custom properties for consistency:

```css
--space-xs:   0.25rem  (4px)   - Minimal gaps
--space-sm:   0.5rem   (8px)   - Small gaps
--space-md:   0.75rem  (12px)  - Medium gaps
--space-lg:   1rem     (16px)  - Large gaps
--space-xl:   1.25rem  (20px)  - X-large gaps
--space-2xl:  1.5rem   (24px)  - 2X-large gaps
```

### Usage

```tsx
// Compact gap (use --space-xs or --space-sm)
<div style={{ gap: 'var(--space-xs)' }}>

// Normal gap (use --space-md or --space-lg)
<div style={{ gap: 'var(--space-md)' }}>

// Utility classes (also available)
<div className="compact-gap"> {/* gap: var(--space-xs) */}
<div className="compact-pad"> {/* padding: var(--space-sm) */}
```

## Color System

### Colors
```css
--text-primary:     Primary text (auto switches with theme)
--text-muted:       Secondary text, labels
--text-secondary:   Tertiary text, hints
--surface:          Background
--surface-elevated: Cards, panels
--surface-muted:    Placeholder, disabled state
--accent:           Primary color (blue)
--accent-dark:      Darker accent
--success:          Green (#10b981)
--warning:          Amber (#f59e0b)
--danger:           Red (#ef4444)
```

### Themes

Three theme options available via dropdown in topbar:

- **🔄 Auto**: Follows system preference (prefers-color-scheme)
- **☀️ Light**: Light theme always on
- **🌙 Dark**: Dark theme always on

Theme preference is saved to localStorage as `yahaml-theme`.

## Components

### Buttons (`.btn`)

Base button styles for all actions:

```tsx
<button className="btn">Basic</button>
<button className="btn primary">Primary</button>
<button className="btn secondary">Secondary</button>
<button className="btn success">Success</button>
<button className="btn warning">Warning</button>
<button className="btn danger">Delete</button>
<button className="btn small">Small</button>
<button className="btn icon">🔌</button>
```

**Properties:**
- Compact padding: `--space-xs --space-md`
- Smooth transitions on hover
- Disabled state with opacity: 0.5
- Icon buttons with minimal padding

### Panels (`.panel`)

Container for grouped content:

```tsx
<div className="panel">
  <h2>Section Title</h2>
  <div>Content here</div>
</div>

<div className="panel compact">
  {/* Even more compact padding */}
</div>
```

**Properties:**
- Padding: `--space-md` (or `--space-sm` for compact variant)
- Border-radius: `--radius-lg` (12px)
- Auto background and border colors

### Forms (`.form-grid`, `.field`)

Responsive form layouts:

```tsx
<div className="form-grid">
  <div className="field">
    <label>Name</label>
    <input type="text" />
  </div>
</div>

<div className="form-grid compact">
  {/* Smaller gap between fields */}
</div>

<div className="form-grid full">
  {/* Single column layout */}
</div>
```

**Properties:**
- Default: `repeat(auto-fit, minmax(160px, 1fr))`
- Compact: Same grid but smaller gaps
- Full: Single column for long forms

### Lists (`.station-list`, `.station-card`)

Compact list items:

```tsx
<div className="station-list">
  <div className="station-card">
    <h3>Station Name</h3>
    <p>Additional info</p>
  </div>
</div>
```

**Properties:**
- Small padding: `--space-sm`
- Hover/active states with border highlight
- Minimal vertical gap: `--space-xs`

### Activity Feed (`.activity-feed`, `.activity-item`)

Compact activity log:

```tsx
<div className="activity-feed">
  <div className="activity-item">
    <span className="activity-message">Message</span>
    <span className="activity-time">12:34 PM</span>
  </div>
</div>
```

**Properties:**
- Extra compact: `--space-xs` gaps
- Muted colors for secondary info
- Time right-aligned

### Radio Controls (`.radio-card`, `.radio-details`)

Specialized for radio management:

```tsx
<div className="radio-card">
  <h3>Radio Name</h3>
  <div className="radio-details">
    <div className="radio-detail">
      <div className="radio-detail-label">Frequency</div>
      <div className="radio-detail-value">7.040 MHz</div>
    </div>
  </div>
  <div className="radio-actions">
    {/* action buttons */}
  </div>
</div>
```

**Properties:**
- Grid layout: `repeat(auto-fit, minmax(140px, 1fr))`
- Small labels and values
- Flex action buttons

## Layout Patterns

### Dashboard Grid

3-column responsive layout optimized for information density:

```tsx
<div className="dashboard-grid">
  <div className="system-panel">
    {/* Top-left: System status */}
  </div>
  <div className="stations-panel">
    {/* Top-right to bottom: Stations list */}
  </div>
  <div className="activity-panel">
    {/* Bottom-left: Activity feed */}
  </div>
</div>
```

**Responsive behavior:**
- Desktop: 2-column grid with optimal gaps
- Mobile: Stacks to single column automatically

### View Container

Main content area with consistent padding:

```tsx
<div className="view-container">
  <div className="view-header">
    <h1>Page Title</h1>
    <p className="view-description">Description</p>
  </div>
  
  <div className="view-content">
    {/* Content sections */}
  </div>
</div>
```

**Properties:**
- Padding: `--space-lg`
- Main font-size: 0.875rem (14px) for density

## Typography

All font sizes use `rem` units for consistency:

```css
h1: 1.5rem (24px)
h2: 0.9rem (14px)  /* panel headers */
h3: 0.8rem (13px)  /* sub-headers */

body: 0.875rem (14px)
.text-sm:  0.8rem  (13px)
.text-xs:  0.7rem  (11px)
```

## Utility Classes

Quick styling helpers:

### Spacing
```tsx
<div className="m-xs">      {/* margin: --space-xs */}
<div className="m-sm">      {/* margin: --space-sm */}
<div className="mt-md">     {/* margin-top: --space-md */}
<div className="mb-lg">     {/* margin-bottom: --space-lg */}
<div className="p-md">      {/* padding: --space-md */}
```

### Flexbox
```tsx
<div className="flex-center">    {/* justify-content: center */}
<div className="flex-between">   {/* justify-content: space-between */}
<div className="items-center">   {/* align-items: center */}
```

### Text
```tsx
<div className="text-muted">     {/* color: var(--text-muted) */}
<div className="opacity-50">     {/* opacity: 0.5 */}
```

## Breaking Points

Three responsive breakpoints:

```css
--bp-mobile:   640px
--bp-tablet:   1024px
--bp-desktop:  1280px
```

### Mobile Styles (< 640px)

- Reduced padding in view-container
- Single-column forms
- Smaller topbar with stacked actions
- Simplier navigation

## Logging UI Recommendations

For the high-density logging screen, use:

1. **Compact Panels**
   ```tsx
   <div className="panel compact">
   ```

2. **Dense Grids**
   ```tsx
   <div className="form-grid compact">
   ```

3. **Minimal Gaps**
   ```tsx
   <div style={{ gap: 'var(--space-xs)' }}>
   ```

4. **Small Typography**
   ```tsx
   <span className="text-xs">Label</span>
   <span className="text-sm">Value</span>
   ```

5. **Utility Spacing**
   ```tsx
   <div className="m-0 p-xs">Tight spacing</div>
   ```

6. **Radio Details Pattern**
   Use `.radio-details` grid pattern for QSO info display

## Responsive Patterns

### Form with Conditional Columns

```tsx
<div className="form-grid">
  {/* Auto-fits from 160px min to 1fr max */}
  {/* On mobile (640px), reduces padding */}
  {/* Stack individual fields if needed */}
</div>

<div className="form-grid full">
  {/* Force single column on all screens */}
</div>
```

### Grid That Adapts

```tsx
<div style={{ 
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 'var(--space-sm)'
}}>
  {/* Items auto-wrap */}
</div>
```

## Theme Implementation

### Auto-detect (Default)

Uses `prefers-color-scheme: dark` media query:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --text-primary: #f9fafb;
    /* ... dark theme vars ... */
  }
}
```

### Explicit Theme Classes

Override auto-detection:

```tsx
// Light theme
<html className="theme-light">

// Dark theme  
<html className="theme-dark">
```

### Theme Toggle Code

```tsx
const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>(() => {
  return localStorage.getItem('yahaml-theme') || 'auto'
})

useEffect(() => {
  localStorage.setItem('yahaml-theme', theme)
  const root = document.documentElement
  if (theme === 'auto') {
    root.classList.remove('theme-light', 'theme-dark')
  } else {
    root.classList.remove('theme-light', 'theme-dark')
    root.classList.add(`theme-${theme}`)
  }
}, [theme])
```

## CSS Custom Properties Reference

```css
/* Colors */
--text-primary, --text-muted, --text-secondary
--surface, --surface-elevated, --surface-muted
--accent, --accent-dark, --success, --warning, --danger

/* Spacing */
--space-xs, --space-sm, --space-md, --space-lg, --space-xl, --space-2xl

/* Sizing */
--radius-sm, --radius-md, --radius-lg, --radius-xl

/* Timing */
--transition-fast (0.15s), --transition-normal (0.2s)

/* Z-Index */
--z-sticky (10), --z-modal (100)
```

## Migration from Old CSS

### Old → New

| Old | New |
|-----|-----|
| `padding: 1rem` | `padding: var(--space-lg)` |
| `gap: 0.75rem` | `gap: var(--space-md)` |
| `border-radius: 8px` | `border-radius: var(--radius-lg)` |
| `margin-bottom: 2rem` | `className="mb-lg"` |
| Multiple padding values | Use `--space-*` variables consistently |

## Testing Responsiveness

Check responsive behavior:

```bash
# Chrome DevTools
- Toggle device toolbar (Ctrl+Shift+M)
- Test at 640px, 1024px, 1280px breakpoints

# Visual regression
- Screenshot at 3 breakpoints
- Compare themes (light/dark/auto)
```

## Performance Notes

- **CSS Size**: ~13.5 KB gzip (compact vs 18 KB before)
- **Scrollbar**: Custom styled with 8px width
- **Transitions**: Fast (0.15s) for snappy feel
- **No animations**: Just transitions for performance

## Future Enhancements

- [ ] Resizable panel dividers (for logging)
- [ ] Collapsible sections
- [ ] Custom spacing per-component
- [ ] Additional theme variants (high contrast, etc.)
- [ ] CSS zoom for different density levels
- [ ] Print-optimized styles
