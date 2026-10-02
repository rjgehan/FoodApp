import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { cx } from './ui';

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
  className,
  children,
}: {
  title: string;
  /** The small line above the title. */
  over?: ReactNode;
  /** A line under the title. */
  subtitle?: ReactNode;
  className?: string;
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

  // On a phone the overline sits 8px under the top bar's household pill, as the mockup's does:
  // the bar is 56px tall with 12px under its pill, so the title pulls up into that a little. A
  // round button beside the title is taller than its line, and pulled up as far would have its
  // top shaved off flat by the bar — so with one the row only rises as far as the bar's edge.
  return (
    <div className={cx('pb-3 pt-1 max-md:pt-0', children ? 'max-md:-mt-1' : 'max-md:-mt-2', className)}>
      <div className="flex items-end justify-between gap-2.5">
        <div className="min-w-0">
          {over && <p className="mb-0.5 text-[0.8125rem] font-medium text-muted">{over}</p>}
          <h1 ref={heading} className="title-large break-words">
            {title}
          </h1>
        </div>
        {children && <div className="flex shrink-0 items-center gap-2.5">{children}</div>}
      </div>
      {subtitle && <p className="mt-1.5 text-muted">{subtitle}</p>}
    </div>
  );
}
