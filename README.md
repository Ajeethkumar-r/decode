# DECODE — deploy guide

A stress-free math detective web app for teens. React + Vite frontend,
one Vercel serverless function that proxies Claude, optional Supabase
for Google login.

## What you need
1. A GitHub account (to hold the code)
2. A Vercel account, free tier — https://vercel.com (sign in with GitHub)
3. An Anthropic API key — https://console.anthropic.com → API keys
4. (Optional, for "Continue with Google") a free Supabase project

## Deploy in ~10 minutes
```bash
# 1. push this folder to a new GitHub repo
git init && git add -A && git commit -m "DECODE v1"
git remote add origin https://github.com/<you>/decode.git
git push -u origin main
```
2. In Vercel: **Add New Project** → import the repo → Framework: Vite → Deploy.
3. In Vercel → Project → **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your key
   Redeploy. Done — the AI sidekick, Case Forge, "my own question",
   coach and word help all work through `/api/claude` (your key never
   reaches the browser; a light per-IP rate limit is built in).

## Google login (optional)
1. Create a project at https://supabase.com → copy the Project URL and anon key.
2. Supabase → Authentication → Providers → **Google** → enable.
   It asks for a Google OAuth Client ID/Secret: create one at
   https://console.cloud.google.com → APIs & Services → Credentials →
   OAuth client (Web). Authorized redirect URI: the one Supabase shows you.
3. Supabase → Authentication → URL Configuration → add your Vercel URL
   to Site URL / redirect URLs.
4. In Vercel env vars add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   Redeploy. The "Continue with Google" button appears automatically;
   without these vars the app quietly uses on-device profiles.

## What's already handled
- Progress saves on-device (localStorage) — XP, badges, stars, The 99,
  daily quiz/game/puzzle reset properly at midnight
- Share links: `/card#...` renders a public achievement card, data
  encoded in the link itself — no database needed
- SPA routing + API rewrites via `vercel.json`

## Costs (realistic)
- Vercel: free tier is plenty
- Claude API: sidekick/coach replies are capped at ≤1000 tokens; a
  heavy day of one student is a few hundred calls → well under $1/day.
  Set a monthly spend limit in the Anthropic console to be safe.

## Later (when you have >1 real user)
Move progress from localStorage into Supabase tables keyed by the
Google user id — the PRD's `users` / `student_quests` schema finally
becomes useful. ~1 evening of work.

## Local dev
```bash
npm install
npm run dev            # frontend only (AI calls need `vercel dev`)
npx vercel dev         # frontend + /api/claude together
```
