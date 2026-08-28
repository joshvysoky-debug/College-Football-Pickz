'use client';

import { useEffect } from 'react';

export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        // Non-fatal — the app works fine without it, this just enables
        // "Add to Home Screen" install behavior on Android/Chrome.
        console.warn('Service worker registration failed:', err);
      });
    }
  }, []);

  return null;
}
