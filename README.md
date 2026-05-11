# Habit Tracker

A personal habit tracking web app built with **React + Vite** + **Supabase** + **Tailwind CSS**, hosted on **GitHub Pages**.

> **Disclaimer:** This project was built with AI assistance (Claude/Cline). The architecture, code, database schema, configuration, and documentation were generated and refined through AI-pair-programming during a single development session.

## Features

- **Today's View** – See which habits are due today and quickly log Success / Partial / Missed
- **Calendar View** – Monthly grid with color-coded days showing your habit completion
- **Habits Management** – Create, edit, disable, and delete habits with day-of-week recurrence
- **Authentication** – Email/password login via Supabase Auth (supports 1–5 users)
- **Mobile-friendly** – Bottom tab navigation, responsive layout
- **Free tier** – Supabase (500MB DB, 50K MAU) + GitHub Pages (unlimited static hosting)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS 4 |
| Backend | Supabase (PostgreSQL + Auth) |
| Routing | React Router v6 (HashRouter) |
| Hosting | GitHub Pages (+ CI/CD via GitHub Actions) |

## Getting Started

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project (free tier)
2. In the SQL Editor, paste and run the contents of **`supabase-migration.sql`** to create the database schema
3. Go to **Project Settings → API** and copy the **Project URL** and **anon public key**

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Run locally

```bash
npm install
npm run dev
```

The app will start at `http://localhost:5173/habit-tracker/`

### 4. Enable Authentication

In your Supabase dashboard:

1. Go to **Authentication → Providers**
2. Ensure **Email** is enabled (it is by default)
3. Optionally disable "Confirm email" if you want instant sign-up for your small user group

### 5. Deploy to GitHub Pages

Push to the `main` branch. The `.github/workflows/deploy.yml` action will automatically:

1. Install dependencies
2. Build the app
3. Deploy to GitHub Pages

Make sure your GitHub repository has **Pages** enabled and set to deploy from the `gh-pages` branch.

## Database Schema

See `supabase-migration.sql` for the full schema. Key tables:

- **profiles** – User profiles linked to Supabase Auth
- **habits** – Habit definitions with day-of-week recurrence (JSONB)
- **habit_logs** – Daily logs (success / partial / fail), one row per habit per day

All tables have **Row Level Security (RLS)** enabled – users can only access their own data.

## Project Structure

```
src/
├── components/
│   └── Layout.tsx          # App shell with top bar + bottom nav
├── contexts/
│   └── AuthContext.tsx      # Supabase Auth provider
├── lib/
│   ├── habits.ts           # API functions (CRUD habits + logs)
│   └── supabase.ts         # Supabase client
├── pages/
│   ├── AuthPage.tsx        # Login / Register
│   ├── TodayPage.tsx       # Today's due habits + logging
│   ├── CalendarPage.tsx    # Monthly calendar view
│   └── HabitsPage.tsx      # Habit management (CRUD)
├── types/
│   └── index.ts            # TypeScript types
├── App.tsx                 # Router + auth guard
├── main.tsx                # Entry point
└── index.css               # Tailwind import
```

## Usage Flow

1. **Sign up** with email + password (first user creates the account)
2. Go to **Habits** tab → create habits with day-of-week recurrence
3. Open **Today** tab to see what's due → tap Done / Partial / Missed
4. Check the **Calendar** tab to see your monthly progress
5. Disable habits you want to pause (without losing history)