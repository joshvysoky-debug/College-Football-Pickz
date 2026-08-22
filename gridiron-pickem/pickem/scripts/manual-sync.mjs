// Hits your deployed (or locally running) app's /api/sync route once, for
// testing the CFBD pull without waiting on the Vercel cron schedule.
//
// Usage:
//   BASE_URL=http://localhost:3000 CRON_SECRET=xxx node scripts/manual-sync.mjs
//   BASE_URL=https://your-app.vercel.app CRON_SECRET=xxx node scripts/manual-sync.mjs

const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error('Set CRON_SECRET to the same value as in your .env');
  process.exit(1);
}

const res = await fetch(`${baseUrl}/api/sync?secret=${secret}`);
const body = await res.json();
console.log(res.status, body);
