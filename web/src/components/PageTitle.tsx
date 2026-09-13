import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

/** How a page tells the header its title has scrolled out of sight (null: it is visible again). */
const CompactTitle = createContext<(title: string | null) => void>(() => {});

export const CompactTitleProvider = CompactTitle.Provider;

/**
 * A page's large title, the iOS way: big and tightly set at the top of the page, and once it
 * scrolls under the bar a small copy fades into the bar, so you always know where you are.
 * `children` sit at the title's right, for the one or two actions that belong to the whole page.
 */
export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  const setCompact = useContext(CompactTitle);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = heading.current;
    if (!el) return;
    // The top margin is the bar's height: "out of sight" means gone under the bar, not off the page.
    const observer = new IntersectionObserver(
      ([entry]) => setCompact(entry.isIntersecting ? null : title),
      { rootMargin: '-64px 0px 0px 0px' },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      setCompact(null);
    };
  }, [title, setCompact]);

  return (
    <div className="pb-1">
      <div className="flex items-end justify-between gap-3">
        <h1 ref={heading} className="large-title min-w-0 break-words">
          {title}
        </h1>
        {children && <div className="mb-1 flex shrink-0 items-center gap-1">{children}</div>}
      </div>
      {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
    </div>
  );
}
