package com.gehan.mealplanner.config;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.service.CupboardService;
import com.gehan.mealplanner.service.GroceryCategoryService;
import com.gehan.mealplanner.service.IngredientService;
import com.gehan.mealplanner.service.RecipeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;

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

    /**
     * Baking and Spices used to be part of Dry goods. After the stale value checks are gone (see
     * SchemaTouchUps), move across whatever the keyword list says belongs in them now.
     */
    @Bean
    @Order(10)
    public ApplicationRunner moveIntoBakingAndSpices(IngredientService ingredientService) {
        return args -> {
            try {
                int moved = ingredientService.moveIntoBakingAndSpices();
                if (moved > 0) {
                    log.info("Moved {} ingredients into Baking and Spices", moved);
                }
            } catch (Exception e) {
                log.warn("Could not move ingredients into Baking and Spices: {}", e.getMessage());
            }
        };
    }

    /**
     * A recipe used to hold one source link and one video link, in columns of its own. Now it
     * keeps a list; copy the old pair across for every recipe that has not got one yet, and turn
     * an imported recipe's bare-address description into a link. The old columns stay where they
     * are, kept in step with the list, for older phones and a rollback.
     *
     * Requests are already being served while this runs, and it may fail; neither loses a link,
     * because a recipe with an empty list is shown — and saved — from its old columns until then.
     */
    @Bean
    public ApplicationRunner moveRecipeLinksIntoList(RecipeService recipeService) {
        return args -> {
            try {
                int filled = recipeService.backfillSourceLinks();
                if (filled > 0) {
                    log.info("Moved the links of {} recipes into their link lists", filled);
                }
            } catch (Exception e) {
                log.warn("Could not move recipe links into their link lists: {}", e.getMessage());
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

    /**
     * Grocery categories used to be the fixed {@code StoreSection} list, shared by everyone.
     * A household from before editable categories existed has none of its own yet — give it the
     * original twelve, named and ordered exactly as the old fixed list was, before the next
     * backfill moves its old placements onto them. Must run before
     * {@link #migrateIngredientSectionsToCategories}.
     */
    @Bean
    @Order(1)
    public ApplicationRunner seedGroceryCategories(HouseholdRepository householdRepository,
                                                    GroceryCategoryService groceryCategoryService) {
        return args -> {
            try {
                for (Household household : householdRepository.findAll()) {
                    groceryCategoryService.seedDefaults(household);
                }
            } catch (Exception e) {
                log.warn("Could not seed default grocery categories: {}", e.getMessage());
            }
        };
    }

    /**
     * Before editable categories, a household's per-item placement was
     * {@code ingredient_sections.section} — one of the fixed {@code StoreSection} values. That
     * column is no longer mapped by the entity (categories are a table now), but the old values
     * are still sitting in the database, so match each row's household to the category it seeded
     * that section into and point the new {@code category_id} at it. Only ever touches rows still
     * missing a category, so it is harmless to repeat.
     */
    @Bean
    @Order(2)
    public ApplicationRunner migrateIngredientSectionsToCategories(JdbcTemplate jdbc) {
        return args -> {
            try {
                int moved = jdbc.update("""
                        UPDATE ingredient_sections iss
                        SET category_id = gc.id
                        FROM grocery_categories gc
                        WHERE iss.category_id IS NULL
                          AND iss.household_id = gc.household_id
                          AND gc.seeded_from = iss.section
                        """);
                if (moved > 0) {
                    log.info("Migrated {} ingredient placements onto grocery categories", moved);
                }
            } catch (Exception e) {
                log.warn("Could not migrate ingredient placements onto grocery categories: {}", e.getMessage());
            }
        };
    }

    /**
     * Grocery rows from before "asked for" was kept. A row somebody typed has the name they typed,
     * and a row no planned meal has a share in can only be there because somebody put it there —
     * a meal's row always carries its share, and goes when the last one does. Marking both keeps
     * a "salt" typed last week on the list when a meal with salt to taste leaves the plan.
     */
    @Bean
    public ApplicationRunner markGroceryRowsAskedFor(JdbcTemplate jdbc) {
        return args -> {
            try {
                int marked = jdbc.update("""
                        UPDATE grocery_list_items gli
                        SET asked_for = true
                        WHERE NOT gli.asked_for
                          AND (gli.custom_name IS NOT NULL
                               OR NOT EXISTS (SELECT 1 FROM grocery_list_item_meals m
                                              WHERE m.grocery_list_item_id = gli.id))
                        """);
                if (marked > 0) {
                    log.info("Marked {} grocery rows as asked for by hand", marked);
                }
            } catch (Exception e) {
                log.warn("Could not mark grocery rows as asked for: {}", e.getMessage());
            }
        };
    }
}
