import { Link } from 'react-router-dom';
import type { Recipe } from '../api/types';
import { imageUrl } from '../api/client';
import { cx } from './ui';
import { Icon } from './icons';
import { formatMinutes, photoClass, totalMinutes } from '../utils/recipeFormat';

export default function RecipeGrid({ recipes }: { recipes: Recipe[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
      className="block transition-transform active:scale-[0.98]"
    >
      {/* A real cover when one exists; otherwise a food-coloured gradient with a faint mark.
          The picture is the tile — no frame round it and the words, just the words under it. */}
      <div
        className={cx(
          'relative flex aspect-[5/4] items-center justify-center overflow-hidden rounded-[18px]',
          !recipe.coverImageId && photoClass(recipe.id),
        )}
      >
        {recipe.coverImageId ? (
          <img src={imageUrl(recipe.coverImageId)} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon name="utensils" strokeWidth={1.6} className="h-[34%] w-[34%] opacity-90" />
        )}
        {/* Only when the caption below cannot say where it came from. */}
        {recipe.shared && !recipe.ownerName && (
          <span className="absolute right-2 top-2 rounded-full bg-surface/85 px-2 py-0.5 text-[0.7rem] font-medium text-muted">
            Shared
          </span>
        )}
      </div>

      <div className="px-0.5 pt-2">
        <p className="serif line-clamp-2 text-[1.0625rem] leading-snug">{recipe.name}</p>
        <p className="mt-1 text-sm text-muted">
          Serves {recipe.servings}
          {total ? ` · ${formatMinutes(total)}` : ''}
        </p>
        {recipe.shared && recipe.ownerName ? (
          <p className="mt-1 truncate text-xs text-faint">from {recipe.ownerName}</p>
        ) : (
          recipe.categories.length > 0 && (
            <p className="mt-1 truncate text-xs text-faint">{recipe.categories.join(' · ')}</p>
          )
        )}
      </div>
    </Link>
  );
}
