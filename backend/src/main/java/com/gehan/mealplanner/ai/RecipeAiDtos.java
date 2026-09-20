package com.gehan.mealplanner.ai;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;

public class RecipeAiDtos {

    public record GenerateRecipeRequest(
            @NotBlank String name,
            @NotNull @Min(1) Integer servings) {
    }

    /**
     * A draft, not a saved recipe. It has no id because nothing has been written — it goes into
     * the form so a person can look at the quantities before any of it reaches the catalog.
     */
    public record GeneratedRecipe(
            String name,
            String description,
            Integer prepTimeMinutes,
            Integer cookTimeMinutes,
            int servings,
            List<GeneratedIngredient> ingredients,
            /** Already joined one step per line, the way the app stores instructions. */
            String instructions,
            /**
             * Where the steps came from, so a client knows what it is holding.
             *
             * A publisher's own steps are exact and belong on screen as written. Steps
             * recovered from somebody talking over a video are a reconstruction, and worth
             * offering to tidy up. Null when nothing said.
             */
            MethodSource methodSource,
            /**
             * What was said in the video, one sentence per entry, before anything was thrown
             * away — hook and sign-off included.
             *
             * Only for a SPOKEN method, and only so a client with a language model on it can
             * do better than the rules did. Half of what a rule drops is the other half of a
             * sentence the transcriber cut in two, and nothing downstream can repair damage
             * it cannot see. Empty everywhere else.
             */
            List<String> spokenLines) {

        /** Most callers know exactly where their steps came from and say so; this is the rest. */
        public GeneratedRecipe(String name, String description, Integer prepTimeMinutes,
                Integer cookTimeMinutes, int servings, List<GeneratedIngredient> ingredients,
                String instructions) {
            this(name, description, prepTimeMinutes, cookTimeMinutes, servings, ingredients,
                    instructions, null, List.of());
        }

        public GeneratedRecipe(String name, String description, Integer prepTimeMinutes,
                Integer cookTimeMinutes, int servings, List<GeneratedIngredient> ingredients,
                String instructions, MethodSource methodSource) {
            this(name, description, prepTimeMinutes, cookTimeMinutes, servings, ingredients,
                    instructions, methodSource, List.of());
        }

        public GeneratedRecipe withMethod(String newInstructions, MethodSource source) {
            return new GeneratedRecipe(name, description, prepTimeMinutes, cookTimeMinutes,
                    servings, ingredients, newInstructions, source, spokenLines);
        }
    }

    public enum MethodSource {
        /** The page's own schema.org steps, or a caption that laid them out. */
        PUBLISHED,
        /** Reconstructed from a transcript of somebody narrating over a video. */
        SPOKEN
    }

    public record GeneratedIngredient(String ingredientName, BigDecimal quantity, String unit) {
    }
}
