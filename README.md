# Habit Tracker

A mobile-first habit tracking web app built as a personal productivity tool and as an experiment in AI-assisted full-stack development.

Built with **React**, **TypeScript**, **Vite**, **Tailwind CSS**, and **Supabase**, deployed to **GitHub Pages** via **GitHub Actions**, and installable to a phone home screen as a PWA.

> **AI-use disclaimer:** This project was built with AI assistance using **ChatGPT, Claude, DeepSeek, and Cline**. I used these tools for architecture planning, implementation, debugging, code review, documentation, and iterative feature refinement. Product direction, requirements, design decisions, validation criteria, and final acceptance were guided by me.

## What the app does

- **Log your day in taps**: Done / Partial / Skip / Missed per habit, with optional per-day notes.
- **Backfill without guilt**: a not-logged nudge for recent days, plus a week grid (habits × last 7 days) where one tap cycles a cell through done → partial → skipped → missed → clear.
- **Fixed weekday habits and "N times per week" habits**, with optional eligible weekdays for the flexible ones.
- **Focus signals that are readable on a phone**: a 7-day strip and streak per habit, habits sorted worst-first, and a habit-load nudge when your daily load is unrealistic.
- **Insights tab**: day-by-day month view, performance-first weekly/monthly breakdowns, per-habit history, 8-week trend.
- **Criteria upgrades without rewriting history**: change a target such as `50 min` to `2 h` from a chosen date while older logs keep their original standard.
- **Pause / resume** (indefinitely or until a date), **JSON export** of all habits and logs, light/dark theme.

## The scoring model

This is the part that took the most iteration, because the original "points out of due units" number was unintuitive and demotivating.

- **Performance is the headline:** done earns 1 point, partial earns 0.5, and missed earns 0. The main percentage is performance on scored outcomes, so logging every item as missed cannot look green.
- **Coverage remains useful context:** *logged* means how many due habits you closed out. Not logging is deliberately separate from missing a habit, so forgetting to open the app does not silently become failure.
- **"N times per week" habits never enter the daily percentage.** They show weekly progress against a target that is only as large as the week allows so far — a 4x/week habit is `1/1 on pace` on Monday, not `0/4`.
- **Skip is neutral, Missed counts against you.** `skipped` records a deliberate choice; only `fail` is a penalty.
- **Streaks**: fixed habits count consecutive due days (a partial keeps the engagement streak but breaks the success streak); flexible habits count consecutive completed weeks.

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS v4 |
| Backend | Supabase PostgreSQL |
| Auth | Supabase Auth |
| Routing | React Router (HashRouter, GitHub Pages friendly) |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions |
| Mobile | Installable PWA (manifest + no-op service worker) |
| AI-assisted development | ChatGPT, Claude, DeepSeek, Cline |

## Project structure

```
src/
  components/Layout.tsx     app shell: header, theme toggle, bottom nav
  contexts/                 auth + theme (provider / context / hook split)
  lib/habits.ts             all Supabase reads and writes
  lib/supabase.ts           client + configuration check
  pages/TodayPage.tsx       log screen: day bar, backlog nudge, list + week grid
  pages/InsightsPage.tsx    month view, this week, per-habit history, trend
  pages/HabitsPage.tsx      create/edit/pause/reorder/export
  pages/AuthPage.tsx        email + password sign in/up
  utils/date.ts             local-date-only helpers (no UTC drift)
  utils/scoring.ts          the single scoring engine used by every screen
  types/index.ts            shared types
supabase-migration.sql                      fresh-project schema
supabase-migration-order-rpc-and-skip.sql   existing-project migration (snapshots first)
```

## Local development

```bash
npm install
cp .env.example .env      # then fill in your Supabase project URL + anon key
npm run dev               # http://localhost:5173/habit-tracker/
npm run lint
npm run build
npm run preview
```

## Database setup

Run the SQL in this order (Supabase SQL editor):

1. **New project:** run `supabase-migration.sql` once.
2. **Existing project:** run `supabase-migration-order-rpc-and-skip.sql`. It creates `habits_backup_<date>` / `habit_logs_backup_<date>` snapshots first, then renumbers `order_index`, adds the `unique (user_id, order_index)` guardrail, installs the `move_habit` RPC and allows the `skipped` status. Keep the snapshot tables until you are happy with the result.
3. **Then run `supabase-migration-criteria-history.sql`** to preserve changing Done / Partial / Miss criteria by effective date. It snapshots `habits`, seeds each existing habit with its current labels from its start date, and adds no new table.

The older `supabase-migration-update.sql` and `supabase-migration-order-index.sql` are kept for history; they are superseded by the file above (the old `order_index` backfill could never match, which is why reordering used to do nothing).

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: `npm ci` → `npm run lint` → `npm run build` (with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from repository secrets) → publish `dist/` to GitHub Pages.

## Install it as an app (optional, no native build needed)

- **Android/Chrome:** open the site → ⋮ menu → *Add to Home screen* / *Install app*.
- **iOS/Safari:** Share → *Add to Home Screen*.

It then opens full-screen with its own icon, no browser chrome. Real push notifications would need a server or a push service, which this project deliberately does not have; the app nudges you in-app instead (the backlog card on the Today tab).

## Known limits

- Supabase free tier has no automatic backups: the migration's snapshot tables and the **Export data** button are the safety net.
- All scoring is computed client-side, so historical numbers change when the scoring rules change (raw logs are never rewritten).
- No automated test suite yet. The scoring engine was validated with a throwaway harness covering day statuses, half points, flexible pacing, skips, pause windows, streaks and strips.

## AI-assisted development workflow

1. defining product requirements and acceptance criteria
2. generating scoped implementation prompts
3. using AI coding agents for implementation
4. reviewing generated diffs manually
5. asking agents to perform self-audits against approved scope
6. running lint/build checks after changes
7. performing manual smoke tests before accepting commits

The aim was to explore how AI tools can be used responsibly in software development: not as blind code generation, but as a faster engineering loop with human direction, review, and validation.
