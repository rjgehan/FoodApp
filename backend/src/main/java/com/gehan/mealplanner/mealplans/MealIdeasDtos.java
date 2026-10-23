package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/** Meal ideas: a few recipes the kitchen can make, for a household that does not plan ahead. */
public class MealIdeasDtos {

    /**
     * @param meal    which meal they are for; dinner when left out
     * @param count   how many; {@link MealIdeas#DEFAULT_COUNT} when left out
     * @param exclude recipes not to suggest: the ones already on screen, and the ones swapped away
     */
    public record MealIdeasRequest(
            MealType meal,
            @Min(1) @Max(MealIdeas.MAX_COUNT) Integer count,
            @Size(max = 500) List<UUID> exclude) {
    }

    /**
     * @param ideas   best first: the household's own recipes, then what other households have
     *                published, each as the household sees it on its page
     * @param canMake how many recipes for this meal the kitchen can make, the ones excluded and the
     *                ones already on the list included: what the ideas are chosen from
     * @param leftOut how many recipes for this meal need a machine the kitchen doesn't have; 0 for
     *                a household that has not said what its kitchen has
     */
    public record MealIdeasResponse(MealType meal, List<RecipeResponse> ideas, int canMake, int leftOut) {
    }
}
