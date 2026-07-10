# UI Component-Level Facelift

**Date:** 2026-07-08
**Status:** Approved

## Summary

Restyle existing Cortex pages for more visual personality and variety. Break the settings page into tabs. No API/schema changes — purely visual.

## Visual Identity Upgrades

### Cards
- Memory cards: 4px left-side category color accent bar (rounded strip), increased padding (p-6), rounded-2xl corners, softer shadows
- Dashboard stat cards: Larger numbers (text-4xl font-light), subtle tinted backgrounds per card type
- All cards: rounded-2xl instead of rounded-lg

### Typography
- Page titles: font-bold (700), letter-spacing -0.03em
- `.maze-eyebrow`: Prepend a small lime dot (4px circle) before text
- Memory content: text-[15px] leading-relaxed

### Color & Accents
- Active/selected nav and filter states: lime/10 background tint instead of plain gray muted
- Category tags: rounded-full pills with softer saturated backgrounds
- Strength bar on memory cards: gradient from lime to amber instead of solid color
- Selected category in sidebar: lime left border accent

### Layout Rhythm
- Dashboard stats: First card spans 2 columns (hero card), remaining cards fill grid
- Section dividers: Thin lime decorative line under `.maze-eyebrow` labels
- More whitespace between sections (space-y-12 instead of space-y-10)

## Settings Reorganization

Split the settings page into 4 tabs using a horizontal tab bar:

1. **Connections** — Service status cards + detected integrations + accounts
2. **Policies** — Exchange policies + review mode preferences
3. **Integrations** — Connectors (Gmail, Drive, Notion, Granola) + MCP server config
4. **Advanced** — Danger zone + sources management

Use `useState` tab state with simple button-based tab bar (no router changes). Each tab renders its section content. This reduces visible content from ~1600 lines to ~400 per view.

## Files to Modify

| File | Change |
|------|--------|
| `src/app/globals.css` | Update `.maze-card`, `.maze-eyebrow`, `.maze-tag` styles; add accent bar utility |
| `src/app/memories/page.tsx` | Category accent bar, richer card layout, rounded-full tags |
| `src/app/dashboard/page.tsx` | Asymmetric stat grid, section divider styling |
| `src/app/review/page.tsx` | Softer card styling, rounded-2xl |
| `src/app/settings/page.tsx` | Tab bar + split into 4 tab sections |
| `src/app/landing/page.tsx` | Match updated card/rounded styles |
| `src/components/top-nav.tsx` | Active state uses lime tint |

## Out of Scope
- No API changes
- No schema changes
- No new routes
- No new dependencies
