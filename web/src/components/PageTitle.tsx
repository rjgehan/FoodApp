import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

/** How a page tells the header its title has scrolled out of sight (null: it is visible again). */
const CompactTitle = createContext<(title: string | null) => void>(() => {});

export const CompactTitleProvider = CompactTitle.Provider;

/**
 * A page's large title (the mockup's `large` row): 34px in the theme's title font, with an
 * optional quiet line above it ("Tuesday, September 29") and the page's one or two actions at
 * its right — usually round buttons (IconButton shape="round") or the round ••• ActionMenu. Once
 * it scrolls under the top bar a small copy fades into the bar, so you always know where you are.
 */
export function PageTitle({
  title,
  over,
  subtitle,
  children,
}: {
  title: string;
  /** The small line above the title. */
  over?: ReactNode;
  /** A line under the title. */
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
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
    <div className="pb-3 pt-1">
      <div className="flex items-end justify-between gap-2.5">
        <div className="min-w-0">
          {over && <p className="mb-0.5 text-[0.8125rem] font-medium text-muted">{over}</p>}
          <h1 ref={heading} className="title-large break-words">
            {title}
          </h1>
        </div>
        {children && <div className="mb-0.5 flex shrink-0 items-center gap-2.5">{children}</div>}
      </div>
      {subtitle && <p className="mt-1.5 text-muted">{subtitle}</p>}
    </div>
  );
}
