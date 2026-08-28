'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function AuthWelcomePage() {
  const router = useRouter();
  const [isStandalone, setIsStandalone] = useState<boolean | null>(null);

  useEffect(() => {
    // iOS Safari uses the non-standard `navigator.standalone`; everyone else
    // (installed Android/desktop PWAs) uses the `display-mode` media query.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    setIsStandalone(standalone);

    if (standalone) {
      // Already inside the installed app — just continue on in.
      router.replace('/');
    }
  }, [router]);

  // Standalone check hasn't resolved yet, or we're mid-redirect: render
  // nothing rather than flashing the "return to the app" message.
  if (isStandalone !== false) {
    return null;
  }

  return (
    <div className="mx-auto mt-12 max-w-sm text-center">
      <div className="mb-8 flex justify-center">
        <Image
          src="/icon-512.png"
          alt="CFB Game Time"
          width={512}
          height={512}
          priority
          className="h-24 w-24 rounded-2xl shadow-glow"
        />
      </div>

      <h1 className="mb-3 font-display text-2xl tracking-wide text-chalk sm:text-3xl">
        You&rsquo;re signed in!
      </h1>

      <div className="rounded-lg border border-field-line bg-field-panel px-8 py-10 shadow-glow">
        <p className="text-sm text-muted">
          Email links always open in Safari, even if you&rsquo;ve installed Gridiron
          Pick&rsquo;em on your Home Screen &mdash; that&rsquo;s an iPhone thing, not a bug.
        </p>
        <p className="mt-4 text-sm text-chalk">
          Close this tab, then open <span className="text-bulb">Gridiron Pick&rsquo;em</span>{' '}
          from your Home Screen icon and you&rsquo;ll already be signed in.
        </p>

        
          href="/"
          className="mt-6 inline-block w-full rounded bg-bulb px-3 py-2 font-semibold text-field-night transition hover:bg-bulb-dim"
        >
          Or continue here in Safari
        </a>
      </div>
    </div>
  );
}
