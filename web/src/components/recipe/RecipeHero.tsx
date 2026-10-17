import type { ReactNode } from 'react';
import { imageUrl } from '../../api/client';
import type { Recipe } from '../../api/types';
import { formatMinutes } from '../../utils/recipeFormat';
import { orderedMachines } from '../../utils/machines';
import { sectionLabel } from '../../utils/recipeMeta';
import { Icon, type IconName } from '../icons';
import { MachineIcon } from '../MachineIcons';
import { cx, Photo, Pill } from '../ui';

/**
 * The top of a recipe (the mockup's 3.7, Option 1): its cover photo — or its colour, when it has
 * none — edge to edge, with the round back, share and ••• buttons over it and the recipe's name
 * set on the picture: its drawer above, its tags as small chips under it, then its quick facts
 * and the machines it needs.
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
  const filed = drawerPill(recipe);
  const machines = orderedMachines(recipe.appliances ?? []);
  const facts: { icon: IconName; text: string; label: string }[] = [];
  if (recipe.prepTimeMinutes) {
    facts.push({ icon: 'clock', text: `${shortMinutes(recipe.prepTimeMinutes)} prep`, label: `Prep ${formatMinutes(recipe.prepTimeMinutes)}` });
  }
  if (recipe.cookTimeMinutes) {
    facts.push({ icon: 'flame', text: `${shortMinutes(recipe.cookTimeMinutes)} cook`, label: `Cook ${formatMinutes(recipe.cookTimeMinutes)}` });
  }
  facts.push({ icon: 'users', text: String(recipe.servings), label: `Serves ${recipe.servings}` });

  // At least the mockup's height, and taller when it has to be: a long name with a row of tags
  // and machines grows the picture downwards instead of climbing up under the round buttons.
  return (
    <div className="relative -mx-5 -mt-1 flex min-h-[max(18.125rem,calc(15.25rem+env(safe-area-inset-top)))] flex-col justify-end overflow-hidden text-white md:mx-0 md:mt-0 md:min-h-[22rem] md:rounded-card">
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

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.75rem)] md:pt-4">
        <HeroButton icon="chevL" label={backLabel} onClick={onBack} />
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Starts clear of the buttons (their row, and a gap), however much it has to say. */}
      <div className="relative flex flex-col gap-1.5 px-5 pb-4 pt-[calc(max(env(safe-area-inset-top),0.75rem)+3rem)] md:px-6 md:pb-5 md:pt-16">
        {filed && (
          <div>
            <Pill tone={recipe.shared && !recipe.section ? 'plum' : 'mustard'} className="!text-[0.75rem]">
              {filed}
            </Pill>
          </div>
        )}
        <h1 className="serif text-[2rem] leading-[1.05] [text-wrap:balance] md:text-[2.5rem]">{recipe.name}</h1>
        {/* Tags are side by side, not a path: a recipe is Chicken and Quick, not Chicken › Quick. */}
        {recipe.section && recipe.categories.length > 0 && (
          <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
            {recipe.categories.map((tag) => (
              <li
                key={tag}
                className="flex items-center gap-1 rounded-full bg-white/[0.18] px-2 py-[2px] text-[0.75rem] font-medium backdrop-blur-sm"
              >
                <Icon name="tag" size={11} strokeWidth={2.4} className="opacity-80" />
                {tag}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.8125rem]">
          {facts.map((f) => (
            <span key={f.icon} className="flex items-center gap-1 opacity-[0.92]" aria-label={f.label}>
              <Icon name={f.icon} size={14} />
              <span aria-hidden="true">{f.text}</span>
            </span>
          ))}
          {machines.length > 0 && (
            <ul aria-label="Machines it needs" className="flex flex-wrap gap-1.5">
              {machines.map((m) => (
                <li
                  key={m.key}
                  title={m.label}
                  className="flex items-center gap-1 rounded-full border border-white/40 px-2 py-[1px] text-[0.75rem] font-medium"
                >
                  <MachineIcon machine={m.key} size={13} strokeWidth={2.2} />
                  {m.short}
                </li>
              ))}
            </ul>
          )}
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

/** The drawer it is filed in — or who shared it, while it is not filed here yet. */
export function drawerPill(recipe: Recipe): string | null {
  if (!recipe.section) return recipe.shared ? `Shared by ${recipe.ownerName ?? 'another household'}` : null;
  return sectionLabel(recipe.section);
}

/** "15", "1 hr 10": the hero's facts are short, and say "prep" and "cook" after them. */
function shortMinutes(minutes: number): string {
  if (minutes < 60) return String(minutes);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest}` : `${hours} hr`;
}
