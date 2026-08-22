'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setErrorMsg(error.message);
      setStatus('error');
    } else {
      setStatus('sent');
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="stub-notch rounded-lg border border-field-line bg-field-panel px-8 py-10 shadow-glow">
        <p className="font-score text-xs uppercase tracking-[0.3em] text-bulb">Week 0 &middot; Kickoff</p>
        <h1 className="mt-2 font-display text-4xl tracking-wide text-chalk">Gridiron Pick&rsquo;em</h1>
        <p className="mt-3 text-sm text-muted">
          Enter your email and we&rsquo;ll send a link to sign in. No password to remember.
        </p>

        {status === 'sent' ? (
          <p className="mt-6 rounded border border-turf/40 bg-turf/10 px-4 py-3 text-sm text-chalk">
            Check your inbox for a sign-in link.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-field-line bg-field-night px-3 py-2 text-chalk placeholder:text-muted focus:border-bulb"
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full rounded bg-bulb px-3 py-2 font-semibold text-field-night transition hover:bg-bulb-dim disabled:opacity-50"
            >
              {status === 'sending' ? 'Sending link\u2026' : 'Send sign-in link'}
            </button>
            {status === 'error' && <p className="text-sm text-miss">{errorMsg}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
