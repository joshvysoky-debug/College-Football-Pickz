'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

// How far (in px) the user has to pull before releasing triggers a refresh.
const PULL_THRESHOLD = 70;
// Visual cap so the indicator doesn't keep stretching on a long drag.
const MAX_PULL = 100;

/**
 * Custom pull-to-refresh gesture for the installed PWA.
 *
 * Standalone-mode PWAs (manifest.ts sets `display: 'standalone'`) don't get
 * the browser's native pull-to-refresh on iOS or Android — that gesture only
 * exists in the browser chrome, which a standalone app doesn't have. This
 * recreates it by hand: track a downward touch drag starting from the very
 * top of the scrolled content, show a small spinner that follows the pull,
 * and call router.refresh() past the threshold.
 *
 * router.refresh() re-runs the current route's server components against
 * fresh data (the Supabase queries in app/picks/[week]/page.tsx, etc.)
 * without a full page reload, so it's cheap and keeps scroll position.
 */
export default function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const isPulling = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      // Only start tracking if we're already at the very top of the page —
      // otherwise this would hijack ordinary scrolling everywhere else.
      if (window.scrollY > 0 || refreshing) return;
      startY.current = e.touches[0].clientY;
      isPulling.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!isPulling.current || startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setPullDistance(0);
        return;
      }
      // Damped so the indicator doesn't chase the finger 1:1 the whole way.
      setPullDistance(Math.min(MAX_PULL, delta * 0.5));
    }

    function onTouchEnd() {
      if (!isPulling.current) return;
      isPulling.current = false;
      startY.current = null;

      setPullDistance((current) => {
        if (current >= PULL_THRESHOLD) {
          setRefreshing(true);
          router.refresh();
          // router.refresh() doesn't return a promise to await, so this is
          // an approximation of "the refresh visibly landed" rather than a
          // precise signal.
          setTimeout(() => {
            setRefreshing(false);
            setPullDistance(0);
          }, 700);
          return current;
        }
        return 0;
      });
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [refreshing, router]);

  const indicatorVisible = pullDistance > 0 || refreshing;

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed left-0 right-0 top-0 z-50 flex justify-center transition-opacity"
        style={{ opacity: indicatorVisible ? 1 : 0 }}
      >
        <div
          className="mt-2 flex h-8 w-8 items-center justify-center rounded-full border border-field-line bg-field-panel shadow-glow transition-transform"
          style={{ transform: `translateY(${refreshing ? 16 : pullDistance - 24}px)` }}
        >
          <div
            className={`h-4 w-4 rounded-full border-2 border-bulb border-t-transparent ${
              refreshing ? 'animate-spin' : ''
            }`}
            style={refreshing ? undefined : { transform: `rotate(${pullDistance * 3}deg)` }}
          />
        </div>
      </div>
      <div
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
          transition: isPulling.current ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {children}
      </div>
    </>
  );
}
