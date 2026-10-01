import type { ReactNode } from 'react';
import { themeNamed } from '../theme/themes';
import { activeKey, CUSTOM, type Theme } from '../theme/theme';
import { cx } from './ui';

/** The Custom tile's dot before anything is picked: every accent at once. */
const RAINBOW = 'conic-gradient(#D4512E, #F5B800, #3D6B39, #4F46D8, #D4512E)';

/**
 * A theme as a round dot of its accent (the light one, as the mockup draws every tile), with a
 * hairline so Nordic's near-black still has an edge on a dark page. `rainbow` is Custom's dot.
 */
export function ThemeSwatch({
  color,
  rainbow = false,
  className,
  children,
}: {
  color: string;
  rainbow?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)]',
        className,
      )}
      style={{ background: rainbow ? RAINBOW : color }}
    >
      {children}
    </span>
  );
}

/** A person's theme, small, by its key: the theme's accent, or their own. */
export function swatchColor(theme: Theme): string {
  const key = activeKey(theme);
  if (key === CUSTOM) return theme.primary!;
  return themeNamed(key)!.light.accent;
}

export const CUSTOM_RAINBOW = RAINBOW;
