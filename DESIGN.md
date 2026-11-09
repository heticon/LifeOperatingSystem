# Life OS — Minimal design system

Based on the "minimal" skill (bergside/awesome-design-skills, MIT). This file is the rulebook for every screen.

## 1. Context and goals

Intent in one sentence: **a calm, monochrome workspace where text and whitespace do the work, colour appears only where it carries meaning.**

- One person, used many times a day on phone and laptop.
- Scanning speed beats decoration: what's due, what's next, what's done.
- Two layouts share this system: **Simple** (tab bar on the phone, large titles, sheets) and **Obsidian** (sidebar tree, breadcrumbs, side panel).

## 2. Tokens and foundations

### Colour (Paper, the default light theme)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F4F4F1` | page surface (skill `surface`) |
| `--side` | `#EFEFEB` | sidebar, tab bar |
| `--card` | `#FFFFFF` | sheets, inputs, timetable cells |
| `--hover` | `#E9E9E4` | hover and selected rows |
| `--line` | `#DCDCD6` | hairlines, borders |
| `--fg` | `#0C0C09` | text (skill `text`) |
| `--muted` | `#5F5F59` | secondary text, ≥ 4.5:1 on `--bg` |
| `--faint` | `#A8A8A2` | non-text only: icons at rest, disabled, decorative |
| `--accent` | `#0C0C09` | primary: filled buttons, checked boxes, active nav bar (skill `primary`) |
| `--on-accent` | `#F4F4F1` | text/icons on `--accent` |
| `--accent-2` | `#312C85` | secondary: "Today", links, focus ring (skill `secondary`) |
| `--danger` | `#DC2626` | overdue, delete |
| `--warning` | `#D97706` | reserved |
| `--success` | `#16A34A` | reserved |

Other themes (Ink, Stone, Indigo, Graphite, Carbon) must define every token above and pass the same contrast checks.

### Typography (desktop-first expressive scale)

| Role | Font | Size / weight / tracking |
|---|---|---|
| Clock | Inter | 64–128px, 700, −0.05em, tabular figures |
| Page title | Inter | 40px (28px on phones), 700, −0.03em |
| Section title | Inter | 20px, 600, −0.015em |
| Group title (days) | Inter | 16px, 600 |
| Body / list rows | Open Sans | 16px (phones), 15px desktop rows, 400 |
| UI chrome (nav, buttons) | Open Sans | 14px, 500–600 |
| Meta (dates, counts, times) | Inconsolata | 13px, 500, tabular |
| Small labels | Open Sans | 12px, 600 |

Allowed sizes only: 12, 13 (mono meta), 14, 15, 16, 20, 28, 40, clock range.

### Spacing

Scale: **4 / 8 / 12 / 16 / 24 / 32**. Page-level gaps use multiples of 32 (64, 96). No other values.

### Shape and depth

- Radius: 6px controls and cells, 10px sheets and modals. No pill shapes except the count badge.
- Shadows: only on floating layers (sheet, modal, menu): `0 24px 64px rgba(0,0,0,.14)` plus a 1px `--line` border. Never on rows or cards in the page.

## 3. Components

### Page frame (every section)
- Every page starts with `.page-head`: title (Inter 40px / 28px phones, `--fg`) + sub line (`--muted`), controls on the right (stacked under on phones). Home is the one exception (date + clock instead of a title).
- Same top padding everywhere (32px, 16px in Simple layout and on phones).
- Two widths only: **760px** for lists (To-dos, This week, Homework, Focus, Home), **1200px** for grids (Timetable, Calendar). Content column is centred.

### Navigation item
- Anatomy: 16px icon (`--muted`), label 14px, optional count (mono 13px, `--muted`).
- Size: 32px tall desktop, 44px phone; padding 0 12px.
- States: hover `--hover` bg · active text `--fg` 600 + 2px `--accent` bar on the left edge · focus-visible ring.

### Task / homework row
- Anatomy: checkbox, title (16px), meta line (mono 13px, `--muted`): subject dot + name, due, "do on".
- Size: min 48px, padding 12px 8px, 1px `--line` hairline between rows (none above the first).
- Checkbox: 18px square, radius 4px, 1.5px `--muted` border; hover border `--fg`; checked = `--accent` fill with `--on-accent` tick; done title `--muted` with strike-through.
- States: hover `--hover` bg · selected `--hover` bg + 2px `--accent` bar · overdue meta in `--danger`.
- Long titles wrap; meta wraps under the title on narrow screens.

### New-item field
- 48px tall, no box: 1px `--line` bottom border, placeholder `--muted`, plus icon `--muted`.
- Focus: bottom border 2px `--fg`, plus icon `--fg`.

### Buttons
- Primary: `--accent` fill, `--on-accent` text, 32px, radius 6px, 14px 600. Hover opacity .88.
- Secondary: transparent, 1px `--line` border, `--fg` text. Hover `--hover` bg.
- Icon button: 32px square, radius 6px, `--muted` icon; hover `--hover` bg and `--fg` icon.
- Disabled: 40% opacity, no hover change.

### Group header
- Day/section name (Inter 16px 600) + mono meta (13px `--muted`) + optional "Today" in `--accent-2` 12px 600.
- 24px above, 8px below, 1px `--line` under the header.

### Sheet / side panel (task and homework details)
- `--card` surface, 1px `--line` border, radius 10px (sheet) or square (side panel).
- Property rows 48px with hairlines; label 14px `--muted`, value 14px `--fg`, right-aligned in Simple layout.

### Timetable
- Five columns desktop, one column phones.
- Lesson cell: `--card`, 1px `--line` border, radius 6px, 40px tall, 8px subject dot, name 14px 500. No tinted fills.
- Today: header name in `--accent-2` + 2px `--accent-2` underline.

### Calendar (week / day grid)
- The one place with tinted fills (Bohdan asked for Google-like colour blocks): event block = `color-mix(event colour 20%, --card)` + 3px solid left edge in the event colour; text stays `--fg`, time in mono `--muted`.
- Event colour: Google event colour (`colorId` → modern Google palette) or the calendar's colour.
- The whole day fits on one screen: hours run from the earliest to the latest event (at least 07–21) and the hour height is fitted to the space (18–64px); only below 18px does the grid scroll. Hairline per hour, today column 5% `--accent-2` wash, "now" line 2px `--danger`.
- Past events 55% opacity; current event gets a 1px outline in its colour. Details open in a popover (desktop) or bottom sheet (phone).

### Home
- Left-aligned: weekday + date (20px), clock below, then a definition list (label 14px `--muted`, value 15px `--fg`) separated by hairlines. No icon tiles.

### Tab bar (Simple layout, phones)
- `--side` background, 1px `--line` top border, 22px icons, 12px labels; active `--fg` 600, inactive `--muted`.

## 4. Accessibility (testable)

- All text tokens must reach **4.5:1** against `--bg` and `--card` (`--fg`, `--muted`, `--danger`, `--accent-2`). `--faint` must never be used for text.
- Every interactive element must show a **2px `--accent-2` focus ring** with 2px offset on `:focus-visible`.
- Touch targets **≥ 44×44px** on phones (rows 48px, tab items 49px).
- Checkboxes keep `role="checkbox"` + `aria-checked`; icon-only buttons have `aria-label`.
- Colour is never the only signal: overdue also says "overdue"/"yesterday"; Today also says "Today".
- `prefers-reduced-motion` disables transitions.

## 5. Content and tone

Concise, confident, helpful. Labels name the thing, buttons name the action.
- Do: "Add", "Due tomorrow", "1 overdue". Don't: "Submit item", "Upcoming deadline soon!".
- Do: "No open homework." Don't: "Wow, you're all caught up! 🎉".

## 6. Anti-patterns (prohibited)

- Coloured icon tiles or emoji as markers. → plain 16px monochrome icons.
- Shadows on in-page cards/rows. → hairlines.
- Pastel or tinted fills for subjects. → one 8px dot.
- More than one accent hue on a screen (besides subject dots and danger).
- Gradients, glows, blur-heavy glass.
- Text in `--faint`; placeholder text lighter than `--muted`.
- Spacing values outside the scale (e.g. 10px, 14px, 22px).

Migration from v0.5: remove `.sq` tiles, Apple grey-card lists, pastel timetable blocks and the bright blue accent; replace SF/Inter body text with Open Sans.

## 7. QA checklist

- [ ] Only Open Sans, Inter and Inconsolata render (no fallback fonts).
- [ ] Contrast script passes for every theme (text ≥ 4.5:1).
- [ ] No coloured icon tiles anywhere; subject colour appears only as dots.
- [ ] Rows: 48px min, hairlines between, none doubled.
- [ ] Focus ring visible on nav, rows, checkboxes, buttons, inputs.
- [ ] Phone (390px): no horizontal scroll, tab bar visible, targets ≥ 44px.
- [ ] Both layouts and at least one dark theme checked.
