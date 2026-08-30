import { Link } from 'react-router-dom';
import type { Recipe } from '../api/types';
import { imageUrl } from '../api/client';
import { cx } from './ui';
import { coverClass, formatMinutes, totalMinutes } from '../utils/recipeFormat';

export default function RecipeGrid({ recipes }: { recipes: Recipe[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {recipes.map((r) => (
        <li key={r.id}>
          <RecipeTile recipe={r} />
        </li>
      ))}
    </ul>
  );
}

function RecipeTile({ recipe }: { recipe: Recipe }) {
  const total = totalMinutes(recipe);

  return (
    <Link
      to={`/recipes/${recipe.id}`}
      className="block overflow-hidden rounded-2xl border border-line bg-surface transition-transform active:scale-[0.98]"
    >
      {/* A real cover when one exists; otherwise a tinted plate with the initial set large. */}
      <div className={cx('relative flex aspect-[5/4] items-center justify-center', coverClass(recipe.id))}>
        {recipe.coverImageId ? (
          <img src={imageUrl(recipe.coverImageId)} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="select-none font-serif text-5xl font-semibold text-ink/40">
            {recipe.name.charAt(0).toUpperCase()}
          </span>
        )}
        {recipe.shared && (
          <span className="absolute right-2 top-2 rounded-full bg-surface/85 px-2 py-0.5 text-[0.7rem] font-medium text-muted">
            Shared
          </span>
        )}
      </div>

      <div className="p-3">
        <p className="line-clamp-2 font-medium leading-snug">{recipe.name}</p>
        <p className="mt-1 text-sm text-muted">
          Serves {recipe.servings}
          {total ? ` · ${formatMinutes(total)}` : ''}
        </p>
        {recipe.categories.length > 0 && (
          <p className="mt-1 truncate text-xs text-subtle">{recipe.categories.join(' · ')}</p>
        )}
      </div>
    </Link>
  );
}
