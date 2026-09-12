import { useEffect, useRef } from 'react';

/**
 * Runs `fn` when the app comes back into view — the phone unlocked, the tab switched back to, the
 * connection returning. Pages fetch once on mount, so without this a tab left open overnight
 * shows yesterday's plan and lets you edit it as if it were current.
 */
export function useOnResume(fn: () => void) {
  const latest = useRef(fn);
  latest.current = fn;

  useEffect(() => {
    function onChange() {
      if (document.visibilityState === 'visible') latest.current();
    }
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('online', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('online', onChange);
    };
  }, []);
}
