'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function ProfileForm({
  initialDisplayName,
  email,
}: {
  initialDisplayName: string;
  email: string;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const trimmed = displayName.trim();
    if (!trimmed) {
      setError('Display name is required');
      return;
    }

    startTransition(async () => {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: trimmed }),
      });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(responseBody.error ?? 'Could not save display name');
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="stub-notch space-y-4 rounded-lg border border-field-line bg-field-panel p-5"
    >
      <div className="space-y-1">
        <label
          htmlFor="displayName"
          className="font-score text-xs uppercase tracking-widest text-muted"
        >
          Display name
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            setSaved(false);
          }}
          maxLength={24}
          disabled={pending}
          placeholder="e.g. Big Josh"
          className="w-full rounded border border-field-line bg-field-panel2 px-3 py-2 font-display text-lg tracking-wide text-chalk outline-none focus:ring-1 focus:ring-bulb"
        />
        <p className="font-score text-[10px] uppercase tracking-widest text-muted">
          This is what your friends see on the picks page and standings.
        </p>
      </div>

      <div className="space-y-1">
        <span className="font-score text-xs uppercase tracking-widest text-muted">Email</span>
        <p className="font-score text-sm text-muted">{email}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-bulb bg-bulb/15 px-4 py-2 font-score text-sm uppercase tracking-widest text-bulb-bright transition hover:bg-bulb/25 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {error && <span className="text-sm text-miss">{error}</span>}
        {saved && !error && <span className="text-sm text-turf-bright">Saved!</span>}
      </div>
    </form>
  );
}
