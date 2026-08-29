export const AUTH_REQUEST_TIMEOUT_MS = 10000;

/**
 * Supabase's auth calls have no timeout of their own — if the endpoint (or
 * the SMTP send behind signInWithOtp) is slow, the promise just never
 * resolves and the UI hangs on a loading state forever with no way out.
 * This races the real call against a timer so the UI always recovers with
 * a clear, retryable error instead of hanging indefinitely.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number = AUTH_REQUEST_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. Please try again.')), ms)
    ),
  ]);
}
