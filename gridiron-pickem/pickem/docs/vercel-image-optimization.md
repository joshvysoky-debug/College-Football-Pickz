# Vercel Image Optimization — Why We Use `unoptimized` on Team Logos

## The issue (Aug 2026)

Vercel's Hobby (free) plan includes 5,000 Image Optimization "Transformations"
per month. We hit 75% of that quota well before the season was underway.

**Cause:** Team logo images (`team.logo_url`, sourced from the CFBD API) were
rendered through Next.js's `<Image>` component in three different components,
each at a different pixel size:

| Component          | Logo size | Where it renders                          |
|---------------------|-----------|--------------------------------------------|
| `GameCard.tsx`       | 28px      | Every game card, every week                |
| `PlayoffTeamGrid.tsx`| 24px      | Playoff picks page — renders **every** FBS team's logo at once |
| `RecapBoard.tsx`     | 18px      | Weekly recap page                          |

Vercel counts a "transformation" per unique combination of
**source image URL + width + format**. Because the same ~134 team logos were
each being requested at three different widths, that's effectively 3x the
transformation cost of a single-size approach. `PlayoffTeamGrid` was the
single biggest contributor, since it loads the full team roster on one page
load rather than just the handful of teams playing that week.

## The fix

Added the `unoptimized` prop to every `<Image>` tag that renders a team logo,
in all three components above. This tells Next.js to serve the logo directly
from its original CFBD URL, bypassing Vercel's optimization/transformation
pipeline entirely.

```tsx
<Image
  src={team.logo_url}
  alt=""
  width={28}
  height={28}
  unoptimized
  className="h-7 w-7 object-contain"
/>
```

No visual difference is expected — CFBD logo images are already small,
pre-sized PNGs/SVGs, so there's nothing meaningful for Vercel's pipeline to
optimize at 18–28px display size anyway.

## What this means going forward

- Team logo rendering no longer counts against the Image Optimization quota,
  regardless of how many games or teams are shown per week.
- Any leftover usage from the month this was applied is just residual from
  before the fix — it should not keep growing.
- **The pattern to watch for:** if a future feature adds a new `<Image>`
  usage (e.g. a hero banner, user avatar, screenshot upload, og-image
  preview) *without* the `unoptimized` prop, that new image spot will start
  consuming the quota again. When adding new `<Image>` components that pull
  from external URLs (not local `/public` assets), default to `unoptimized`
  unless there's a specific reason to want Vercel's resizing/format
  conversion (e.g. a genuinely large user-uploaded photo where bandwidth
  savings matter more than the transformation cost).
- If the quota issue reappears despite this, check the Vercel dashboard's
  Image Optimization usage panel to see which specific source images are
  driving the count — don't assume it's the same three files without
  checking, since usage attribution isn't always obvious after future
  changes.

## Reference

- Vercel Hobby plan Image Optimization limit: 5,000 transformations/month
  (resets monthly, no charge for exceeding it — new images just return a
  402 error and fall back to alt text until the plan is upgraded or the
  month resets).
- [Vercel docs: Image Optimization limits and pricing](https://vercel.com/docs/image-optimization/limits-and-pricing)
