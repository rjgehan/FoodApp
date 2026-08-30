import type { Recipe } from '../api/types';
import { formatMinutes, formatQuantity, instructionSteps, totalMinutes } from '../utils/recipeFormat';

/**
 * The recipe as a lined 4x6 kitchen card: cream stock, a red header rule, blue ruled lines.
 * Deliberately theme-independent — a card that went dark would stop looking like a card.
 */
export default function RecipeIndexCard({ recipe }: { recipe: Recipe }) {
  const steps = instructionSteps(recipe.instructions);
  const total = totalMinutes(recipe);

  return (
    <div className="index-card overflow-hidden rounded-md">
      <div className="px-5 pt-5 sm:px-7">
        <p className="text-[0.8rem] uppercase tracking-[0.18em] text-[#a1512f]">Recipe for</p>
        <h2 className="mt-0.5 text-3xl leading-tight">{recipe.name}</h2>

        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-0.5 text-[0.95rem] text-[#6b5744]">
          <span>Serves {recipe.servings}</span>
          {recipe.prepTimeMinutes ? <span>Prep {formatMinutes(recipe.prepTimeMinutes)}</span> : null}
          {recipe.cookTimeMinutes ? <span>Cook {formatMinutes(recipe.cookTimeMinutes)}</span> : null}
          {total ? <span>Total {formatMinutes(total)}</span> : null}
        </div>

        {/* The red rule under the header is the giveaway detail on a real card. */}
        <div className="mt-3 h-px bg-[#c96b48]" />
      </div>

      <div className="index-card-ruled px-5 pb-8 pt-2 text-[1.15rem] sm:px-7">
        <p className="text-[#a1512f]">Ingredients</p>
        <ul className="mb-6">
          {recipe.ingredients.map((i) => (
            <li key={i.id} className="flex gap-2">
              <span className="whitespace-nowrap">
                {formatQuantity(i.quantity)} {i.unit}
              </span>
              <span>
                {i.ingredientName}
                {i.notes ? <span className="text-[#6b5744]">, {i.notes}</span> : null}
              </span>
            </li>
          ))}
          {recipe.ingredients.length === 0 && <li className="text-[#6b5744]">—</li>}
        </ul>

        {steps.length > 0 && (
          <>
            <p className="text-[#a1512f]">Method</p>
            <ol className="list-inside">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        {recipe.description && <p className="mt-6 text-[#6b5744]">{recipe.description}</p>}
      </div>
    </div>
  );
}
