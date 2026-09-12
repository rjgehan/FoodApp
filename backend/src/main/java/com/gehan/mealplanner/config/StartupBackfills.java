package com.gehan.mealplanner.config;

import com.gehan.mealplanner.service.CupboardService;
import com.gehan.mealplanner.service.IngredientService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Data moves that bring an existing database up to date, run on every start. Each one only
 * touches rows still in the old shape, so repeating it is harmless — the same approach as
 * {@link SchemaTouchUps}, for data rather than constraints.
 */
@Configuration
public class StartupBackfills {

    private static final Logger log = LoggerFactory.getLogger(StartupBackfills.class);

    /** The grocery list's "Pantry staples" became cupboard items marked staple. */
    @Bean
    public ApplicationRunner moveStaplesIntoCupboard(CupboardService cupboardService) {
        return args -> {
            try {
                int moved = cupboardService.moveLegacyStaples();
                if (moved > 0) {
                    log.info("Moved {} pantry staples into the cupboard", moved);
                }
            } catch (Exception e) {
                log.warn("Could not move pantry staples into the cupboard: {}", e.getMessage());
            }
        };
    }

    /** Ingredients from before aisles existed, placed by the free keyword list — never by Gemini. */
    @Bean
    public ApplicationRunner placeIngredientsInAisles(IngredientService ingredientService) {
        return args -> {
            try {
                int placed = ingredientService.placeUnsortedByKeyword();
                if (placed > 0) {
                    log.info("Placed {} ingredients in store sections", placed);
                }
            } catch (Exception e) {
                log.warn("Could not place ingredients in store sections: {}", e.getMessage());
            }
        };
    }
}
