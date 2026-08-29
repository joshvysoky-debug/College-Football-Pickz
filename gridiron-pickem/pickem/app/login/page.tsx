'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const AUTH_REQUEST_TIMEOUT_MS = 10000;

// Supabase's auth calls have no timeout of their own — if the endpoint (or
// the SMTP send behind signInWithOtp) is slow, the promise just never
// resolves and the button hangs on "Sending..." forever with no way out.
// This races the real call against a timer so the UI always recovers with
// a clear, retryable error instead of hanging indefinitely.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. Please try again.')), ms)
    ),
  ]);
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    const supabase = createClient();
    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithOtp({
          email,
          options: {
            // Keep this so the link still works fine for anyone using the site
            // in a plain Safari tab (no Home Screen install). Folks using the
            // installed app should use the 6-digit code below instead, since
            // iOS keeps the installed app's storage separate from Safari's —
            // a link opened from Mail can never sign in the installed app.
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        }),
        AUTH_REQUEST_TIMEOUT_MS
      );
      if (error) {
        setErrorMsg(error.message);
        setStatus('error');
      } else {
        setStatus('idle');
        setStep('code');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    const supabase = createClient();
    try {
      const { error } = await withTimeout(
        supabase.auth.verifyOtp({
          email,
          token: code,
          type: 'email',
        }),
        AUTH_REQUEST_TIMEOUT_MS
      );
      if (error) {
        setErrorMsg(error.message);
        setStatus('error');
      } else {
        router.replace('/');
        router.refresh();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  return (
    <div className="mx-auto mt-12 max-w-sm">
      <div className="mb-8 flex justify-center">
        <Image
          src="/CFB%20Game%20Time%20Full.png"
          alt="CFB Game Time"
          width={1062}
          height={618}
          priority
          className="h-40 w-auto sm:h-48"
        />
      </div>

      <p className="mb-8 text-center font-display text-2xl tracking-wide text-chalk sm:text-3xl">
        It&rsquo;s football time in <span className="text-bulb">Tennessee</span>
      </p>

      <div className="rounded-lg border border-field-line bg-field-panel px-8 py-10 shadow-glow">
        {step === 'email' ? (
          <>
            <p className="text-sm text-muted">
              Enter your email and we&rsquo;ll send you a 6-digit code to sign in. No
              password to remember.
            </p>
            <form onSubmit={handleSendCode} className="mt-6 space-y-3">
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
                disabled={status === 'loading'}
                className="w-full rounded bg-bulb px-3 py-2 font-semibold text-field-night transition hover:bg-bulb-dim disabled:opacity-50"
              >
                {status === 'loading' ? 'Sending code\u2026' : 'Send sign-in code'}
              </button>
              {status === 'error' && <p className="text-sm text-miss">{errorMsg}</p>}
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              Check your inbox for a 6-digit code and enter it below. (If you tapped the
              link in that email instead, this screen is no longer needed &mdash; but if
              you&rsquo;re using the Home Screen app, come back here and use the code.)
            </p>
            <form onSubmit={handleVerifyCode} className="mt-6 space-y-3">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded border border-field-line bg-field-night px-3 py-2 text-center font-score text-lg tracking-[0.3em] text-chalk placeholder:text-muted placeholder:tracking-normal focus:border-bulb"
              />
              <button
                type="submit"
                disabled={status === 'loading' || code.length === 0}
                className="w-full rounded bg-bulb px-3 py-2 font-semibold text-field-night transition hover:bg-bulb-dim disabled:opacity-50"
              >
                {status === 'loading' ? 'Verifying\u2026' : 'Verify code'}
              </button>
              {status === 'error' && <p className="text-sm text-miss">{errorMsg}</p>}
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setStatus('idle');
                  setCode('');
                  setErrorMsg('');
                }}
                className="w-full text-center text-xs text-muted underline"
              >
                Use a different email
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
