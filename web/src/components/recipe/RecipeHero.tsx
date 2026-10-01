import type { ReactNode } from 'react';
import { imageUrl } from '../../api/client';
import type { Recipe } from '../../api/types';
import { formatMinutes } from '../../utils/recipeFormat';
import { sectionLabel } from '../../utils/recipeMeta';
import { Icon, type IconName } from '../icons';
import { cx, Photo, Pill } from '../ui';

/**
 * The top of a recipe (the mockup's 3.7, Option 1): its cover photo — or its colour, when it has
 * none — edge to edge, with the round back, share and ••• buttons over it and the recipe's name
 * set on the picture, its drawer above and its quick facts under it.
 *
 * On a phone it runs under the status bar like the mockup's; on a wide screen it is a rounded
 * card at the top of the page.
 */
export default function RecipeHero({
  recipe,
  onBack,
  backLabel,
  actions,
}: {
  recipe: Recipe;
  onBack: () => void;
  /** Where Back goes, for assistive tech: "Recipes", "Back". */
  backLabel: string;
  /** The round buttons on the right: share and •••. */
  actions?: ReactNode;
}) {
  const filed = filingPath(recipe);
  const facts: { icon: IconName; text: string; label: string }[] = [];
  if (recipe.prepTimeMinutes) {
    facts.push({ icon: 'clock', text: `${shortMinutes(recipe.prepTimeMinutes)} prep`, label: `Prep ${formatMinutes(recipe.prepTimeMinutes)}` });
  }
  if (recipe.cookTimeMinutes) {
    facts.push({ icon: 'flame', text: `${shortMinutes(recipe.cookTimeMinutes)} cook`, label: `Cook ${formatMinutes(recipe.cookTimeMinutes)}` });
  }
  facts.push({ icon: 'users', text: String(recipe.servings), label: `Serves ${recipe.servings}` });

  return (
    <div className="relative -mx-5 -mt-1 h-[max(18.125rem,calc(15.25rem+env(safe-area-inset-top)))] overflow-hidden text-white md:mx-0 md:mt-0 md:h-[22rem] md:rounded-card">
      {recipe.coverImageId ? (
        <img src={imageUrl(recipe.coverImageId)} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <Photo seed={recipe.id} icon="chef" large className="absolute inset-0 h-full w-full" />
      )}
      {/* Shade at the top for the buttons and at the foot for the name: a real photo can be any
          colour, and the lighter food colours need a little help under white type. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: recipe.coverImageId
            ? 'linear-gradient(180deg, rgba(0,0,0,.32), transparent 28%, transparent 45%, rgba(0,0,0,.62))'
            : 'linear-gradient(180deg, transparent 45%, rgba(0,0,0,.3))',
        }}
      />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.75rem)] md:pt-4">
        <HeroButton icon="chevL" label={backLabel} onClick={onBack} />
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-5 pb-4 md:px-6 md:pb-5">
        {filed && (
          <div>
            <Pill tone={recipe.shared && !recipe.section ? 'plum' : 'mustard'} className="!text-[0.75rem]">
              {filed}
            </Pill>
          </div>
        )}
        <h1 className="serif text-[2rem] leading-[1.05] [text-wrap:balance] md:text-[2.5rem]">{recipe.name}</h1>
        <div className="flex flex-wrap items-center gap-3 text-[0.8125rem] opacity-[0.92]">
          {facts.map((f) => (
            <span key={f.icon} className="flex items-center gap-1" aria-label={f.label}>
              <Icon name={f.icon} size={14} />
              <span aria-hidden="true">{f.text}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The mockup's round white button on a photo. */
export function HeroButton({
  icon,
  label,
  onClick,
  expanded,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-haspopup={expanded === undefined ? undefined : 'dialog'}
      onClick={onClick}
      className={cx(
        'press relative flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.92] text-[#2B211A]',
        'shadow-[0_1px_3px_rgba(0,0,0,0.12)] after:absolute after:-inset-1 after:content-[""]',
      )}
    >
      <Icon name={icon} size={17} />
    </button>
  );
}

/** "Dinner › Chicken" — the drawer and the groups it is in — or who shared it, while unfiled. */
export function filingPath(recipe: Recipe): string | null {
  if (!recipe.section) return recipe.shared ? `Shared by ${recipe.ownerName ?? 'another household'}` : null;
  return [sectionLabel(recipe.section), ...recipe.categories].join(' › ');
}

/** "15", "1 hr 10": the hero's facts are short, and say "prep" and "cook" after them. */
function shortMinutes(minutes: number): string {
  if (minutes < 60) return String(minutes);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest}` : `${hours} hr`;
}
