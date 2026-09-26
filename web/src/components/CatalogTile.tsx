import type { ReactNode } from 'react';
import { cx } from './ui';
import { iconByKey } from './FoodIcons';

/**
 * The face of a drawer or group tile: a square of its colour with the food drawn big in the
 * middle, and the name in a band along the bottom. The picture is what you find it by — Dinner
 * is the pot long before it is the word — so it gets most of the square instead of a corner.
 *
 * With no icon it is just the colour and the name, which is what a group nobody has given a
 * picture to looks like.
 *
 * The drawing is faded with `opacity` rather than a see-through colour: its strokes cross, and
 * a see-through colour would darken every place they do.
 */
export function CatalogTileFace({
  name,
  detail,
  iconKey,
  cornerButton = false,
}: {
  name: string;
  detail: ReactNode;
  iconKey?: string | null;
  /**
   * A group tile has its ••• in the top corner. Round drawings like the full meal's plate reach
   * right into that corner at full size, so the drawing sits a little lower and smaller there.
   */
  cornerButton?: boolean;
}) {
  const Icon = iconByKey(iconKey)?.Icon;

  return (
    <span className="relative block aspect-square">
      {Icon && (
        <Icon
          // Which drawing it is, for a test to find; the name on the tile is what a reader hears.
          data-icon={iconKey}
          className={cx(
            'absolute left-1/2 -translate-x-1/2 text-ink opacity-70',
            cornerButton ? 'top-[11%] h-[59%] w-[59%]' : 'top-[5%] h-[66%] w-[66%]',
          )}
        />
      )}
      <span className="absolute inset-x-0 bottom-0 block bg-surface/50 px-3 pb-2.5 pt-2 backdrop-blur-[2px]">
        <span className="block truncate text-base font-semibold leading-tight">{name}</span>
        <span className="block truncate text-xs text-muted">{detail}</span>
      </span>
    </span>
  );
}

/** Two tiles across on a phone, three once there is room for them. */
export const CATALOG_GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3';

/** The outside of a tile — its colour, its corners, the press — for a link or a button. */
export function catalogTileClass(tint: string) {
  return cx('block w-full overflow-hidden rounded-2xl text-left transition-transform active:scale-[0.98]', tint);
}
