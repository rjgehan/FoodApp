import type { MealPlanEntry, Place, Recipe } from '../../api/types';
import { entryLabel } from '../../utils/planEntry';
import { sourceLabel } from '../../utils/savedLinks';
import { isSafeLink } from '../../utils/videoLink';
import { List, NoteBox, Row, Sheet, Tile } from '../ui';
import MealPicture from './MealPicture';
import { fromIso, mealTitle, slotTime, type PlannedShopping } from './planModel';
import { ServingsStepper, useDraftServings } from './PlanBits';

/**
 * A planned dish's options (the mockup's 2.9): long-press a meal on the plan, or tap a dish in
 * the day sheet. Everything you can do to one dish, one full-width row each — swap it, its
 * servings, its time, which optional extras, put it on the list, open it, take it off.
 *
 * A single food like "eggs" gets its own Add to groceries here: planning eggs does not mean
 * needing eggs, so the week's button leaves it alone.
 */
export default function MealOptionsSheet({
  entry,
  recipe,
  place,
  pictures,
  shopping,
  defaultServings,
  busy,
  onSwap,
  onServings,
  onTime,
  onExtras,
  onAddToGroceries,
  onOpenRecipe,
  onRemove,
  onClose,
}: {
  entry: MealPlanEntry;
  recipe?: Recipe;
  place?: Place;
  pictures: Map<string, string> | null;
  shopping: PlannedShopping | undefined;
  defaultServings: number;
  busy: boolean;
  onSwap: () => void;
  onServings: (servings: number) => Promise<void>;
  onTime: () => void;
  onExtras: () => void;
  onAddToGroceries: () => void;
  /** To the recipe — or its editor, for one that is only a name so far. */
  onOpenRecipe: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const when = fromIso(entry.date);
  const day = `${when.toLocaleDateString(undefined, { weekday: 'long' })} ${when.getDate()}`;
  const [servings, setServings] = useDraftServings(entry.servings ?? defaultServings, onServings);
  const optional = recipe?.ingredients.filter((i) => i.optional) ?? [];
  const chosen = optional.filter((i) => entry.includedOptionalIngredientIds.includes(i.id)).length;
  const label = entryLabel(entry) ?? '';
  const menu = place && isSafeLink(place.menuUrl) ? place.menuUrl! : null;

  return (
    <Sheet
      label={`${label} options`}
      lead={<MealPicture entry={entry} recipe={recipe} pictures={pictures} size={52} />}
      title={<span className="font-sans text-[1.0625rem] font-semibold not-italic tracking-normal">{label}</span>}
      subtitle={`${day} · ${mealTitle(entry.mealType)}`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {entry.recipeDeleted && (
          <NoteBox tone="accent" icon="alert">
            {entry.savedLinkDeleted
              ? 'It was deleted from Saved links, so there is nothing to open. '
              : 'The household that shared this recipe has deleted it, so there is nothing to open. '}
            Swap it for something else, or remove it.
          </NoteBox>
        )}
        <List label="Meal options">
          <Row lead={<Tile icon="swap" tone="accent" size={34} />} title="Swap for something else" onClick={onSwap} disabled={busy} />
          {entry.recipeId && (
            // Servings are about cooking; nobody portions a takeaway in the app.
            <Row
              lead={<Tile icon="users" tone="sky" size={34} />}
              title="Servings"
              end={<ServingsStepper value={servings} onChange={setServings} disabled={busy} />}
            />
          )}
          <Row
            lead={<Tile icon="clock" tone="mustard" size={34} />}
            title="Time"
            detail={slotTime(entry.time) ?? 'None'}
            chevron
            onClick={onTime}
            disabled={busy}
          />
          {optional.length > 0 && (
            <Row
              lead={<Tile icon="leaf" tone="herb" size={34} />}
              title="Optional ingredients"
              detail={`${chosen} of ${optional.length}`}
              chevron
              onClick={onExtras}
              disabled={busy}
            />
          )}
          {entry.recipeId && !entry.needsIngredients && (
            <Row
              lead={<Tile icon="cart" tone="accent" size={34} />}
              title="Add to groceries"
              subtitle={shopping ? groceriesLine(shopping) : undefined}
              onClick={onAddToGroceries}
              disabled={busy}
            />
          )}
          {entry.itemName && (
            <Row
              lead={<Tile icon="cart" tone="accent" size={34} />}
              title={`Add ${entry.itemName} to groceries`}
              subtitle={
                shopping?.status === 'ON_LIST'
                  ? 'Already on the list'
                  : entry.runningLow
                    ? 'Running low'
                    : entry.inCupboard
                      ? 'In the cupboard'
                      : 'Not in the cupboard'
              }
              onClick={onAddToGroceries}
              disabled={busy || shopping?.status === 'ON_LIST'}
            />
          )}
          {entry.recipeId && (
            <Row
              lead={<Tile icon={entry.needsIngredients ? 'pen' : 'book'} tone="plum" size={34} />}
              title={entry.needsIngredients ? 'Add ingredients' : 'Open recipe'}
              chevron
              onClick={onOpenRecipe}
            />
          )}
          {entry.savedLinkId && entry.savedLinkUrl && isSafeLink(entry.savedLinkUrl) && (
            <ExternalRow
              href={entry.savedLinkUrl}
              title={`Open on ${sourceLabel({ source: entry.savedLinkSource, url: entry.savedLinkUrl })}`}
            />
          )}
          {menu && <ExternalRow href={menu} title="Menu" />}
          {place?.phone && <ExternalRow href={`tel:${place.phone.replace(/[^+\d]/g, '')}`} title={`Call ${place.phone}`} icon="phone" />}
          <Row
            lead={<Tile icon="trash" tone="accent" size={34} />}
            title="Remove from plan"
            titleClassName="text-accent-ink"
            onClick={onRemove}
            disabled={busy}
          />
        </List>
        {entry.savedLinkId && !entry.recipeDeleted && (
          <p className="px-1 text-[0.8125rem] text-muted">A saved link has no ingredients, so it adds nothing to Groceries.</p>
        )}
      </div>
    </Sheet>
  );
}

/** "11 items, 3 already in cupboard" */
function groceriesLine(s: PlannedShopping): string | undefined {
  if (s.needs === 0) return 'Nothing to buy — all staples';
  const items = `${s.needs} ${s.needs === 1 ? 'item' : 'items'}`;
  if (s.status === 'ON_LIST') return `${items}, already on the list`;
  return s.inCupboard > 0 ? `${items}, ${s.inCupboard} already in cupboard` : items;
}

function ExternalRow({ href, title, icon = 'link' }: { href: string; title: string; icon?: 'link' | 'phone' }) {
  // Opened where it lives: a TikTok link opens the TikTok app when the phone has it.
  return (
    <li>
      <a
        href={href}
        target={href.startsWith('tel:') ? undefined : '_blank'}
        rel="noopener noreferrer"
        className="press flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left active:bg-surface2"
      >
        <Tile icon={icon} tone="plum" size={34} />
        <span className="min-w-0 flex-1 truncate text-base font-medium">{title}</span>
      </a>
    </li>
  );
}
