import type { Place } from '../api/types';
import { Button } from './ui';
import { isSafeLink } from '../utils/videoLink';

/**
 * The menu and the phone number — the only two things you want from a place at dinner time.
 * Shared between the meal plan and the household's list so both stay in step.
 */
export default function PlaceActions({
  place,
  size = 'sm',
}: {
  place: Place | undefined;
  size?: 'sm' | 'md';
}) {
  if (!place) return null;
  const hasMenu = isSafeLink(place.menuUrl);
  if (!hasMenu && !place.phone) return null;

  return (
    <>
      {hasMenu && (
        <a href={place.menuUrl!} target="_blank" rel="noreferrer noopener">
          <Button size={size} variant="secondary">
            Menu
          </Button>
        </a>
      )}
      {place.phone && (
        // Strip formatting: tel: wants digits, not "(555) 123-4567".
        <a href={`tel:${place.phone.replace(/[^+\d]/g, '')}`}>
          <Button size={size} variant="secondary">
            Call
          </Button>
        </a>
      )}
    </>
  );
}
