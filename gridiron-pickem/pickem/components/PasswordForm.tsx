'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { withTimeout } from '@/lib/withAuthTimeout';

export default function PasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setStatus('error');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      setStatus('error');
      return;
    }

    setStatus('loading');
    const supabase = createClient();
    try {
      const { error: updateError } = await withTimeout(supabase.auth.updateUser({ password }));
      if (updateError) {
        setError(updateError.message);
        setStatus('error');
        return;
      }
      setPassword('');
      setConfirm('');
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="stub-notch space-y-4 rounded-lg border border-field-line bg-field-panel p-5"
    >
      <div>
        <h2 className="font-display text-xl tracking-wide text-chalk">Password</h2>
        <p className="mt-1 font-score text-[10px] uppercase tracking-widest text-muted">
          Set a password so you can sign in without waiting on an emailed code.
        </p>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="newPassword"
          className="font-score text-xs uppercase tracking-widest text-muted"
        >
          New password
        </label>
        <input
          id="newPassword"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setStatus('idle');
          }}
          autoComplete="new-password"
          minLength={6}
          disabled={status === 'loading'}
          className="w-full rounded border border-field-line bg-field-panel2 px-3 py-2 text-chalk outline-none focus:ring-1 focus:ring-bulb"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="confirmPassword"
          className="font-score text-xs uppercase tracking-widest text-muted"
        >
          Confirm password
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setStatus('idle');
          }}
          autoComplete="new-password"
          minLength={6}
          disabled={status === 'loading'}
          className="w-full rounded border border-field-line bg-field-panel2 px-3 py-2 text-chalk outline-none focus:ring-1 focus:ring-bulb"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === 'loading' || !password || !confirm}
          className="rounded border border-bulb bg-bulb/15 px-4 py-2 font-score text-sm uppercase tracking-widest text-bulb-bright transition hover:bg-bulb/25 disabled:opacity-60"
        >
          {status === 'loading' ? 'Saving\u2026' : 'Save password'}
        </button>
        {status === 'error' && <span className="text-sm text-miss">{error}</span>}
        {status === 'success' && <span className="text-sm text-turf-bright">Password set!</span>}
      </div>
    </form>
  );
}
