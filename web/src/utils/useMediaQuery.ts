import { useEffect, useState } from 'react';

/**
 * Whether a CSS media query matches right now, kept current as the window is resized. For the few
 * places where hiding something with a Tailwind breakpoint is not enough — an image hidden with
 * `display: none` is still downloaded, so a phone would pay for pictures it never shows.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
