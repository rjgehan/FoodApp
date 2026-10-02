import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { imageUrl } from '../../api/client';
import type { Recipe, RecipeCategory, RecipeSection } from '../../api/types';
import { iconByKey } from '../FoodIcons';
import { Icon, type IconName } from '../icons';
import { usePushedScreen } from '../Layout';
import { cx, Photo, TONE_SOFT, type Tone } from '../ui';
import { dishIcon } from '../plan/planModel';
import { formatMinutes, totalMinutes } from '../../utils/recipeFormat';
import { sectionLabel } from '../../utils/recipeMeta';
import type { CategoryTree } from '../../utils/categoryTree';

/*
 The catalogue's own pieces (the mockup's 3.1–3.6): the drawer and group cards, a recipe as a
 photo card, a search result row, the trail of where you are, and the floating Add recipe. Built
 from the design system in ui.tsx; nothing here restyles it.
*/

/** Each drawer's colour, as the mockup paints them. */
export const DRAWER_TONES: Record<RecipeSection, Tone> = {
  BREAKFAST: 'mustard',
  LUNCH: 'herb',
  DINNER: 'accent',
  SNACKS: 'plum',
  DRINKS: 'sky',
  OTHER: 'mustard',
};

const GROUP_TONES: Tone[] = ['accent', 'mustard', 'herb', 'sky', 'plum'];

/** A group's colour: the same group, the same colour, wherever it is drawn. */
export function groupTone(id: string): Tone {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return GROUP_TONES[hash % GROUP_TONES.length];
}

/** What is inside a group, in the order you care: the recipes, then whether it opens further. */
export function groupDetail(recipes: number, groups: number): string {
  return (
    `${recipes} ${recipes === 1 ? 'recipe' : 'recipes'}` +
    (groups > 0 ? ` · ${groups} ${groups === 1 ? 'group' : 'groups'}` : '')
  );
}

/**
 * The mockup's icon tile with one of the hand-drawn food icons on it. The drawings are on a
 * 48-unit grid, so they are stroked heavier than usual to come out the weight of the mockup's
 * line icons at tile size. A group with no picture wears a folder.
 */
export function FoodTile({
  iconKey,
  tone,
  size = 40,
  fallback = 'folder',
  className,
}: {
  iconKey?: string | null;
  tone: Tone;
  size?: number;
  fallback?: IconName;
  className?: string;
}) {
  const Food = iconByKey(iconKey)?.Icon;
  return (
    <span
      aria-hidden="true"
      className={cx('flex shrink-0 items-center justify-center', TONE_SOFT[tone], className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      {Food ? (
        <Food data-icon={iconKey ?? undefined} strokeWidth={3.4} style={{ width: size * 0.62, height: size * 0.62 }} />
      ) : (
        <Icon name={fallback} size={Math.round(size * 0.5)} />
      )}
    </span>
  );
}

/** A drawer on the front of Recipes: its tile, its name in the title face, and how many. */
export function DrawerCard({
  to,
  name,
  count,
  iconKey,
  tone,
}: {
  to: string;
  name: string;
  count: number;
  iconKey: string;
  tone: Tone;
}) {
  return (
    <Link to={to} className="card press flex flex-col gap-2.5 p-3.5 active:bg-surface2">
      <FoodTile iconKey={iconKey} tone={tone} />
      <span className="flex flex-col gap-0.5">
        <span className="serif truncate text-[1.25rem] leading-tight">{name}</span>
        <span className="text-[0.8125rem] text-muted">
          {count} {count === 1 ? 'recipe' : 'recipes'}
        </span>
      </span>
    </Link>
  );
}

/** A group inside a drawer: a smaller card, its tile beside the name. */
export function GroupCard({ group, detail, onOpen }: { group: RecipeCategory; detail: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card press flex min-h-[3.75rem] w-full items-center gap-2.5 p-3 text-left active:bg-surface2"
    >
      <FoodTile iconKey={group.iconKey} tone={groupTone(group.id)} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-semibold">{group.name}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
    </button>
  );
}

/** The dashed tile at the end of the groups: make another one here. */
export function NewGroupTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dash press flex min-h-[3.75rem] w-full items-center justify-center gap-2 p-3 text-sm font-semibold text-accent-ink active:bg-surface2"
    >
      <Icon name="plus" size={16} />
      New group
    </button>
  );
}

/** Two across on a phone, three once there is room, four on a computer. */
export const CARD_GRID = 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4';

/**
 * A recipe's picture: its cover if it has one, otherwise the mockup's food-coloured gradient with
 * a faint mark for the kind of meal. A cover that will not load falls back to the gradient.
 */
export function RecipePicture({ recipe, className, style }: { recipe: Recipe; className?: string; style?: React.CSSProperties }) {
  const [broken, setBroken] = useState(false);
  if (recipe.coverImageId && !broken) {
    return (
      <span className={cx('flex shrink-0 overflow-hidden bg-surface2', className)} style={style} aria-hidden="true">
        <img
          src={imageUrl(recipe.coverImageId)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  // A shared recipe has no drawer here yet; the one it is in at home picks its picture.
  return (
    <Photo
      seed={recipe.id}
      icon={dishIcon({ ...recipe, section: recipe.section ?? recipe.ownerSection ?? null })}
      className={className}
      style={style}
    />
  );
}

/**
 * A recipe as a photo card (3.4): the picture, the name under it, and how long it takes. One
 * that came from another household says so, since it cannot be changed from here.
 */
export function RecipePhotoCard({ recipe }: { recipe: Recipe }) {
  const total = totalMinutes(recipe);
  return (
    <Link to={`/recipes/${recipe.id}`} className="press flex flex-col gap-2">
      <RecipePicture recipe={recipe} className="aspect-[171/124] w-full rounded-2xl" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[0.9375rem] font-semibold">{recipe.name}</span>
        <span className="flex items-center gap-1 text-xs text-muted">
          {total ? (
            <>
              <Icon name="clock" size={12} />
              {formatMinutes(total)}
            </>
          ) : (
            `Serves ${recipe.servings}`
          )}
        </span>
        {recipe.shared && recipe.ownerName && (
          <span className="truncate text-xs text-faint">from {recipe.ownerName}</span>
        )}
      </span>
    </Link>
  );
}

export function RecipePhotoGrid({ recipes }: { recipes: Recipe[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
      {recipes.map((r) => (
        <li key={r.id}>
          <RecipePhotoCard recipe={r} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Where a recipe is filed, as a trail: "Dinner › Main dish › Chicken". Recipes carry their
 * groups by name, so the deepest of them in this household's tree is the one worth naming.
 */
export function filingTrail(recipe: Recipe, tree: CategoryTree): string {
  if (!recipe.section) return recipe.ownerName ? `Shared by ${recipe.ownerName}` : 'Shared with you';
  let deepest: RecipeCategory[] = [];
  for (const name of recipe.categories) {
    const group = tree.byName.get(name.toLowerCase());
    if (!group || (group.section !== null && group.section !== recipe.section)) continue;
    const path = tree.path(group.id);
    if (path.length > deepest.length) deepest = path;
  }
  return [sectionLabel(recipe.section), ...deepest.map((g) => g.name)].join(' › ');
}

/** One search result: the picture small, the name, and where it is filed. */
export function RecipeResultRow({ recipe, subtitle }: { recipe: Recipe; subtitle: ReactNode }) {
  return (
    <li>
      <Link to={`/recipes/${recipe.id}`} className="press flex min-h-[52px] items-center gap-3 px-4 py-3 active:bg-surface2">
        <RecipePicture recipe={recipe} className="h-11 w-11 rounded-[10px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium">{recipe.name}</span>
          <span className="mt-px block truncate text-[0.8125rem] text-muted">{subtitle}</span>
        </span>
      </Link>
    </li>
  );
}

/** "Dinner › Main dish › Chicken" under the bar, each step but the last a way back to it. */
export function Breadcrumbs({ steps }: { steps: { label: string; onClick?: () => void }[] }) {
  return (
    <nav aria-label="Where you are" className="flex min-w-0 flex-wrap items-center gap-1.5 text-[0.8125rem] text-muted">
      {steps.map((step, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <Icon name="chevR" size={12} className="shrink-0" />}
          {step.onClick ? (
            <button type="button" onClick={step.onClick} className="press truncate">
              {step.label}
            </button>
          ) : (
            <b className="truncate font-semibold text-ink" aria-current="page">
              {step.label}
            </b>
          )}
        </span>
      ))}
    </nav>
  );
}

/**
 * The floating "+ Add recipe" over a group's recipes, above the tab bar on a phone and in the
 * corner of the page on a computer — lined up with the page's own right edge.
 */
export function FloatingAddRecipe({ to }: { to: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-10 md:bottom-8">
      <div className="mx-auto flex w-full max-w-3xl justify-end px-5 md:px-8 lg:max-w-5xl">
        <Link
          to={to}
          className="press pointer-events-auto flex h-[3.25rem] items-center gap-2 rounded-full bg-accent px-5 text-[1.0625rem] font-semibold text-on-accent shadow-lift active:brightness-95"
        >
          <Icon name="plus" size={19} />
          Add recipe
        </Link>
      </div>
    </div>
  );
}

/**
 * Hides the phone's top bar while it is drawn — for the catalogue's search, which takes the
 * whole top of the screen the way iOS search does.
 */
export function HideTopBar() {
  usePushedScreen();
  return null;
}
