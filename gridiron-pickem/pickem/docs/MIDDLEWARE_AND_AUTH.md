# Middleware & Auth — Read This Before Touching `middleware.ts`

This file exists because we broke this three different ways in one day
(Aug 29, 2026) by "fixing" it incrementally without seeing the whole
picture. Each fix was individually reasonable and individually wrong. This
doc is the whole picture, so it doesn't happen a fourth time.

## The one invariant that matters

**`middleware.ts` must call Supabase to refresh the session, bounded by a
timeout, and it must fail OPEN (let the request through) if that call is
slow or errors — never fail closed, and never call Supabase with no bound
at all.**

Every version of middleware that violated one piece of this broke something:

| Version | What it did | What broke |
|---|---|---|
| Original | Called `supabase.auth.getUser()`/`getSession()` with no timeout | Slow Supabase → Vercel's own 25s limit killed the whole request → `504 MIDDLEWARE_INVOCATION_TIMEOUT` |
| "Fix" #1 | Added a 5s timeout on the fetch, but redirected to `/login` on any timeout/error (fail **closed**) | Supabase auth-js retries internally on failure, so total time could still exceed Vercel's limit — same 504 came back |
| "Fix" #2 | Removed the Supabase call entirely; middleware only checked whether *a* session cookie existed | Can never 504 (no network call at all) — but Server Components can't persist a refreshed cookie (see below), so with middleware no longer refreshing tokens, every session went stale ~1hr after login. Games, picks, and playoff picks all silently disappeared (RLS treats a stale/expired token as unauthenticated and returns zero rows, not an error) |
| **Current (correct)** | Real `getUser()` call, 4s timeout via `AbortSignal.timeout`, **fails open** to a cheap cookie-presence check on any error/timeout | Bounded (can't 504), refreshes sessions when Supabase is healthy, degrades gracefully instead of blocking real users when Supabase is slow |

## Why middleware has to be the one doing the refresh

Next.js **Server Components cannot set cookies** — only Middleware, Route
Handlers, and Server Actions can. `lib/supabase/server.ts`'s `createClient()`
wraps its `set`/`remove` cookie callbacks in a silent `try/catch` specifically
because every page in this app (`app/picks/[week]/page.tsx`,
`app/playoff-picks/page.tsx`, etc.) is a Server Component — if a page's own
`getUser()` call tries to persist a refreshed token, it fails silently and
does nothing.

That means **middleware is the only place in this codebase that can ever
refresh and persist a session cookie.** If middleware doesn't call
Supabase's auth server at all, sessions can never renew themselves, no
matter how well every other file is written.

## What "fails open" means here, concretely

- If the real auth check succeeds within the timeout → use its result
  (redirect to `/login` if genuinely no user, otherwise let it through with
  a refreshed session cookie if one was needed).
- If the real check times out or errors → **don't redirect based on
  that failure.** Fall back to the cheap, network-free check of "does a
  Supabase auth cookie exist at all," and let the request through if so.
- Never redirect a real user to `/login` just because Supabase was slow.
  Being wrongly logged out during a Supabase blip is worse than briefly
  seeing slightly stale data.

## Symptoms that mean this invariant has been broken again

- **504 / `MIDDLEWARE_INVOCATION_TIMEOUT`** → something in middleware is
  making an unbounded (or insufficiently bounded) network call.
- **Pages render, but all data is empty (games, picks, playoff picks) and
  the Sign Out button in `NavBar.tsx` has vanished** → sessions aren't being
  refreshed anymore; `getUser()` is quietly returning `null` everywhere
  because the access token expired with nothing renewing it. This is what
  "Fix #2" above caused — it looks like a data or RLS bug, but it's actually
  a middleware regression.

## Related, lower-stakes findings from the same day

- **`app/login/page.tsx`'s `signInWithOtp`/`verifyOtp` calls also had no
  timeout**, and would hang the "Send Code" button forever if Supabase's
  auth/SMTP path was slow. Fixed with a client-side `withTimeout()` wrapper
  (10s) so the button always recovers with a retryable error instead of
  hanging silently. This is a UX safety net, not a security boundary.
- **The `featured`, `home_rank`, and `away_rank` columns on `games`, and the
  entire `playoff_picks` table + its RLS policies, are not defined in any
  committed migration** — they exist in the live Supabase project but were
  added directly via the dashboard at some point. Functionally fine today,
  but means the repo's `supabase/schema.sql` + `migrations/*.sql` are not a
  complete, reproducible source of truth for the current schema. Worth
  writing a `004_*.sql` migration to close this gap when there's time — not
  urgent, but flagged so it isn't forgotten.
- **External outages are real and will look exactly like your own bugs.**
  On Aug 27–29, 2026, Supabase had a live incident ("Increased response
  times for requests," degraded API Gateway) that overlapped with debugging
  this exact issue. Before assuming a code change caused a symptom, check
  <https://status.supabase.com> — it directly explained part of what we saw
  that day.

## The rule going forward

Don't simplify `middleware.ts` to "fix" a timeout or a stale-session issue
without re-reading this file first. Any future change to it should be
checked against the table above: does it still call Supabase (bounded), and
does it still fail open? If a proposed change breaks either property, it's
reintroducing a bug we've already paid for once.
