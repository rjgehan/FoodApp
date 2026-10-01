import { useState } from 'react';
import { imageUrl } from '../../api/client';
import type { MealPlanEntry, Recipe } from '../../api/types';
import { cx, Photo, Tile } from '../ui';
import { mealIcon } from './planModel';

/**
 * A planned dish's picture. The recipe's cover or the restaurant's photo where there is room for
 * real pictures (`pictures`, wide screens only — a phone keeps to the drawn plates and downloads
 * none); otherwise the mockup's food-coloured plate with an icon for the kind of meal. Eating out
 * is a plum shop front, as everywhere.
 *
 * A cover that was deleted, or a server briefly away, falls back to the plate rather than the
 * browser's broken-image box — remembered by id, so a new cover gets its own try.
 */
export default function MealPicture({
  entry,
  recipe,
  pictures,
  size,
  radius = 12,
  className,
}: {
  entry: MealPlanEntry;
  recipe?: Recipe;
  /** Recipe, place or saved-link id → image id, or null where there is no room for photos. */
  pictures: Map<string, string> | null;
  size: number;
  radius?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const key = entry.recipeId ?? entry.placeId ?? entry.savedLinkId ?? '';
  // A saved link is its picture — the video's cover is how you know which one — so it shows on
  // a phone too.
  const imageId = (pictures ?? null)?.get(key) ?? (entry.savedLinkId ? entry.savedLinkImageId ?? undefined : undefined);
  const style = { width: size, height: size, borderRadius: radius };

  if (imageId && failed !== imageId) {
    return (
      <span className={cx('flex shrink-0 overflow-hidden bg-surface2', className)} style={style} aria-hidden="true">
        <img
          src={imageUrl(imageId)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(imageId)}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  if (entry.placeId) return <Tile icon="store" tone="plum" size={size} radius={radius} className={className} />;
  if (entry.itemName) return <Tile icon="cupboard" tone="sky" size={size} radius={radius} className={className} />;
  return (
    <Photo
      seed={key || entry.id}
      icon={entry.savedLinkId ? (entry.savedLinkSource === 'WEB' ? 'globe' : 'play') : mealIcon(recipe?.section, entry.mealType)}
      className={className}
      style={style}
    />
  );
}
