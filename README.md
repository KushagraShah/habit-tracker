# Habit Tracker

A mobile-first habit tracking web app built as a personal productivity tool and as an experiment in AI-assisted full-stack development.

The app is built with **React**, **TypeScript**, **Vite**, **Tailwind CSS**, and **Supabase**, with deployment through **GitHub Pages** and **GitHub Actions**.

> **AI-use disclaimer:** This project was built with AI assistance using **ChatGPT, Claude, DeepSeek, and Cline**. I used these tools for architecture planning, implementation, debugging, code review, documentation, and iterative feature refinement. Product direction, requirements, design decisions, validation criteria, and final acceptance were guided by me.

## Project Goals

The goal of this project was to build a complete, usable web app quickly while exploring a modern AI-assisted development workflow.

The focus was not just generating code, but using AI tools as part of an engineering loop:

- define product requirements
- break work into scoped implementation prompts
- review generated changes through Git diffs
- run lint/build validation
- identify regressions and edge cases
- refine data models and scoring logic
- keep changes small, reviewable, and production-oriented

## What the App Does

Habit Tracker lets users create habits, log daily progress, and review consistency over time.

The app supports:

- daily habit logging
- fixed weekday schedules
- flexible “N times per week” habits
- Done / Partial / Missed states
- weekly and monthly progress summaries
- calendar visualization
- habit pausing and deletion
- JSON data export
- email/password authentication

## Tech Stack

| Area | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Styling | Tailwind CSS |
| Backend | Supabase PostgreSQL |
| Auth | Supabase Auth |
| Routing | React Router |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions |
| AI-assisted development | ChatGPT, Claude, DeepSeek, Cline |

## Technical Highlights

- **Full-stack app architecture** using React frontend and Supabase backend.
- **Typed frontend codebase** with TypeScript interfaces for habits, logs, scoring, and user state.
- **Supabase Auth integration** with protected user-specific data access.
- **PostgreSQL-backed persistence** for habits and habit logs.
- **Row Level Security** so users can only access their own data.
- **Centralized scoring logic** for daily, weekly, monthly, calendar, and streak calculations.
- **Mobile-first UI** with bottom navigation and responsive layouts.
- **GitHub Actions deployment** to GitHub Pages.
- **AI-assisted development workflow** with prompt-driven implementation, review, debugging, and validation.

## AI-Assisted Development Workflow

This project was intentionally built using next-generation AI coding tools.

The workflow included:

1. defining product requirements and acceptance criteria
2. generating scoped implementation prompts
3. using AI coding agents for implementation
4. reviewing generated diffs manually
5. asking agents to perform self-audits against approved scope
6. running lint/build checks after changes
7. performing manual smoke tests before accepting commits

This helped me explore how AI tools can be used responsibly in software development: not as blind code generation, but as a faster engineering loop with human direction, review, and validation.

## Local Development

```bash
npm install
npm run dev