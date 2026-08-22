# Gridiron Pick'em

A straight-up-winners college football pick'em pool for you and your friends.
Free to run at your scale (2-10 people): $0/month on Vercel + Supabase free tiers.

## What's inside

- **Next.js** app (frontend + API routes) — deploys to Vercel
- **Supabase** — Postgres database + magic-link auth (no passwords)
- **CollegeFootballData.com (CFBD)** — free API for schedules & scores
- A scheduled job (`/api/sync`, run via Vercel Cron) that pulls the latest
  scores every 3 hours during the season

Picks are hidden from other players until a game kicks off, then everyone's
picks become visible.

## One-time setup (about 15-20 minutes)

### 1. Create a Supabase project
1. Go to [supabase.com](https://supabase.com), create a free account and a new project.
2. In the project, open **SQL Editor -> New query**, paste in the entire
   contents of `supabase/schema.sql`, and run it. This creates all tables,
   the standings view, and the security rules.
3. Go to **Project Settings -> API**. You'll need three values in a minute:
   `Project URL`, `anon public` key, and `service_role` key (keep this one secret).
4. Go to **Authentication -> Providers** and make sure **Email** is enabled.
   Under **Authentication -> URL Configuration**, you can leave defaults for now —
   you'll come back and add your real deployed URL after step 3 below.

### 2. Get a free CFBD API key
Go to [collegefootballdata.com/key](https://collegefootballdata.com/key),
enter your email, and the key will be sent to your inbox.

### 3. Deploy to Vercel
1. Push this project to a new GitHub repo.
2. Go to [vercel.com](https://vercel.com), "Add New Project", import the repo.
3. Before deploying, add these Environment Variables (from step 1 & 2 above):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CFBD_API_KEY`
   - `CRON_SECRET` — make up any long random string (e.g. run `openssl rand -hex 32` locally)
4. Deploy. Vercel will give you a URL like `https://your-app.vercel.app`.
5. Back in Supabase, go to **Authentication -> URL Configuration** and set
   **Site URL** to that Vercel URL, and add `https://your-app.vercel.app/auth/callback`
   under **Redirect URLs**.
6. The cron job in `vercel.json` runs automatically once deployed — Vercel
   reads `CRON_SECRET` from your env vars and sends it as the sync route's
   auth header. (Cron on the free Hobby plan runs on Vercel's schedule; check
   your current plan's cron limits in the Vercel dashboard if you want a
   tighter interval than every 3 hours.)

### 4. Invite your friends
Send them the Vercel URL. They enter their email, get a magic link, and
they're in — no account creation, no password.

## Testing the score sync manually

Before the season starts or any time you want to force a refresh:

```bash
BASE_URL=https://your-app.vercel.app CRON_SECRET=your-secret node scripts/manual-sync.mjs
```

Or just visit `https://your-app.vercel.app/api/sync?secret=your-secret` in a browser.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your real values
npm run dev
```

## How the pieces fit together

- `supabase/schema.sql` — run once, sets up your whole database
- `lib/cfbd.ts` — talks to the CollegeFootballData API
- `app/api/sync/route.ts` — the cron job that keeps games/scores current
- `app/api/picks/route.ts` — saves a pick, enforces the kickoff lock
- `app/picks/[week]/page.tsx` — the main "make your picks" screen
- `app/standings/page.tsx` — the leaderboard
- `app/login/page.tsx` + `app/auth/callback/route.ts` — magic-link sign-in

## Notes / known limitations

- The app assumes one season at a time (current calendar year). It'll need a
  small tweak to `lib/cfbd.ts`'s `currentSeasonAndWeek()` if you want to browse
  a prior season's results after the fact.
- Bowl season / postseason games aren't pulled by the sync job yet — it only
  requests `seasonType: 'regular'`. Ask me to add a postseason pass in
  December if your pool runs through bowls.
- Straight-up picks only, as requested — no spread, no confidence points.
  If you want to add those formats later, the data model has room for it.

  
