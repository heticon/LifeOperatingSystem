# Life OS — project guide for Claude

Personal "Life OS" of Bohdan (18, Ukrainian student in Hamburg, Germany). A small, fast personal dashboard that he actually uses every day on his phone and laptop. It replaces an older, overstuffed Life OS that he never used — **keep it lean**.

## How to work with Bohdan

- He writes in Ukrainian (sometimes English). **Reply in simple Ukrainian**, short, with clear numbered next steps. Percentages for trade-offs are welcome.
- **Add features one at a time**, only the ones he asks for. No surprise extras.
- **Always quality-check what you build**: render screenshots (desktop ~1440px and phone 390px, light + one dark theme, both layouts when relevant) and look at them before saying it's done.
- **Always give a link he can open in the browser** — the live site (GitHub Pages) after pushing, not just screenshots.
- Design bar: minimal, professional, premium — "like a $100k agency built it", never AI-looking. `DESIGN.md` is the binding rulebook; read it before any UI change.
- App UI is **English**, except school subject names, which stay German (Mathe, Deutsch, Spanisch, Religion, …).

## Tech

- Plain HTML/CSS/JS, no build step, no framework, no dependencies. Installable PWA.
- `index.html` — markup, inline Lucide SVG sprite (`<use href="#i-name">`), sidebar, tab bar, settings modal.
- `themes.js` — loaded first (before CSS). Themes: paper (default light), ink (dark), stone, indigo, graphite, carbon; "Auto" = paper/ink by system. Sets CSS vars from camelCase tokens (`onAccent` → `--on-accent`, `accent2` → `--accent-2`), `html[data-mode]` = light/dark, `html[data-layout]` = `apple` (shown as **Simple**) or `obsidian`.
- `styles.css` — font-faces, base (Obsidian) rules, old Apple block (mostly overridden), then the **MINIMAL DESIGN SYSTEM** block (`html[data-layout] …`) which wins. Add new styles in/after the Minimal block.
- `app.js` — one IIFE. `Store` (localStorage key data `{version, tasks, projects, school, focusLog}`) is **the single seam for future Supabase sync** — all data writes go through it. Hash routes: `home, focus, tasks, todos, week, project-<id>, school, timetable, homework, subject-<id>, note-<id>`.
- `sw.js` — offline cache, network-first for own files. **Bump `VERSION` (e.g. `lifeos-v8`) on every release** and add any new static file to `SHELL`.
- Fonts bundled locally in `fonts/` (woff2): Open Sans (body), Inter (display/clock), Inconsolata (mono meta). No external font requests.
- Weather: Open-Meteo (no key), Hamburg 53.5511/9.9937, Europe/Berlin, daily mean/max/min + rain chance, cached 30 min (`lifeos.weather`).
- Dates: ISO weeks (2026 has 53), week keys like `2026-W46`, locale `en-GB`.
- Other localStorage keys: `lifeos.theme`, `lifeos.layout`, `lifeos.timer`.
- Gotcha: `html` carries `data-mode`, so never use `closest("[data-mode]")` for in-page controls (that caused a NaN timer bug) — use specific attributes like `data-tmode`.
- Use `’` inside single-quoted JS strings instead of `'`.

## Features (v0.7)

- **Home**: weekday + date, big clock with seconds, ISO week and Hamburg weather compact beside the clock (stacked under it on phones), then rows: School (next lesson), Homework, Focus.
- **Focus**: Pomodoro (Focus/Short/Long, lengths adjustable, 4-session cycle, timer stored as `endsAt` so it survives reloads, chime + vibration + notification), small live clock, today's tasks/homework to pick what you work on, sessions logged to `focusLog`. Space = start/pause.
- **Tasks**: To-dos, This week (per day of ISO week), Projects.
- **School**: Timetable (from the old Life OS, editable; weekends show next week), Homework (due date defaults to the subject's next lesson; groups Overdue / Due today / Due tomorrow / Later this week / Later / No date; "do on" plan day), Subjects with notes.
- **Settings** (menu → Settings): Layout (Simple / Obsidian), Theme, Data, About. Shortcuts: Ctrl+, settings · Ctrl+\ sidebar · N new item · Space focus timer · Esc close.

## Testing

- Serve locally: `python3 -m http.server 8765` in the repo root, test with Playwright (Chromium). Mock the Open-Meteo request in tests.
- Check: no console errors, no horizontal scroll at 390px, touch targets ≥ 44px, text contrast ≥ 4.5:1 in every theme.

## Roadmap (in order, one step at a time)

1. ✅ GitHub repo + GitHub Pages hosting (site updates 1–2 min after each push to `main`).
2. ✅ "New version available · Reload" banner when the service worker updates.
3. Sync across devices with **Supabase** (EU/Frankfurt, **email + password** login — magic links don't open inside an iPhone home-screen PWA; signups disabled; row-level security). Schema: `supabase/schema.sql` (one `items` row per record, `kind` + `data` jsonb, client `updated_at`, soft `deleted`; last write wins). Only the Project URL + **publishable/anon key** go in the code — **never the service_role/secret key**. Swap `Store` to sync, keep localStorage as offline cache + outbox.
4. Google Calendar in Life OS — read **all** his calendars, including the secondary **"PLANNING"** calendar (Supabase Edge Functions hold the OAuth refresh token; OAuth app in Production, not Testing).
5. Life OS connector (MCP) on a Cloudflare Worker with OAuth, so Claude can read and write his tasks/homework/events.
6. Google Drive.
