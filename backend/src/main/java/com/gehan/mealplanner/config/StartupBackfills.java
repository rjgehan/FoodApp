package com.gehan.mealplanner.config;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.service.ApplianceDetector;
import com.gehan.mealplanner.service.CupboardService;
import com.gehan.mealplanner.service.FoodIcons;
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
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Data moves that bring an existing database up to date, run on every start. Each one only
 * touches rows still in the old shape, so repeating it is harmless — the same approach as
 * {@link SchemaTouchUps}, for data rather than constraints.
 */
@Configuration
public class StartupBackfills {

    private static final Logger log = LoggerFactory.getLogger(StartupBackfills.class);

    /**
     * The grocery list's "Pantry staples" became cupboard items marked staple. Ordered, so that
     * {@link #decideWhoKeepsACupboard} can count what it moves.
     */
    @Bean
    @Order(20)
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
     * The cupboard became something a household chooses. One from before then keeps it if it has
     * anything in it — a staple counts, which is why this runs after the staples have moved in —
     * and goes without it if it never used it, as a household made today starts. A household
     * whose choice is still empty shows the cupboard until this has run, so nothing goes missing
     * in between; once decided, it is never looked at again.
     */
    @Bean
    @Order(21)
    public ApplicationRunner decideWhoKeepsACupboard(JdbcTemplate jdbc) {
        return args -> {
            try {
                int decided = decideCupboards(jdbc);
                if (decided > 0) {
                    log.info("Decided whether {} households keep a cupboard", decided);
                }
            } catch (Exception e) {
                log.warn("Could not decide which households keep a cupboard: {}", e.getMessage());
            }
        };
    }

    /** Returns how many households it decided for. */
    public static int decideCupboards(JdbcTemplate jdbc) {
        return jdbc.update("""
                UPDATE households h
                SET cupboard_enabled = EXISTS (SELECT 1 FROM cupboard_items c WHERE c.household_id = h.id)
                WHERE h.cupboard_enabled IS NULL
                """);
    }

    /**
     * Recipes from before machines, and recipes last read by older rules: read each one with
     * today's ApplianceDetector. Never one somebody picked the machines for by hand.
     *
     * In plain SQL rather than through the recipe entity, because requests are already being
     * served while this runs: each recipe is claimed with a conditional update that only matches
     * while it is still stale and nobody has corrected it, in a transaction of its own — so a
     * person saving the same recipe at that moment never has their answer overwritten by a save
     * of the whole recipe from a copy read before theirs.
     */
    @Bean
    public ApplicationRunner detectRecipeAppliances(JdbcTemplate jdbc, TransactionTemplate tx) {
        return args -> {
            try {
                int read = detectAppliances(jdbc, tx);
                if (read > 0) {
                    log.info("Read the kitchen machines {} recipes need", read);
                }
            } catch (Exception e) {
                log.warn("Could not read the kitchen machines recipes need: {}", e.getMessage());
            }
        };
    }

    /** Returns how many recipes it read. */
    public static int detectAppliances(JdbcTemplate jdbc, TransactionTemplate tx) {
        List<Map<String, Object>> stale = jdbc.queryForList("""
                SELECT id, name, description, instructions FROM recipes
                WHERE NOT appliances_edited AND coalesce(appliances_version, 0) < ?
                """, ApplianceDetector.VERSION);
        int read = 0;
        for (Map<String, Object> row : stale) {
            UUID id = (UUID) row.get("id");
            Set<String> appliances = ApplianceDetector.detect(
                    (String) row.get("name"), (String) row.get("description"), (String) row.get("instructions"));
            Boolean claimed = tx.execute(status -> {
                int updated = jdbc.update("""
                        UPDATE recipes SET appliances_version = ?
                        WHERE id = ? AND NOT appliances_edited AND coalesce(appliances_version, 0) < ?
                        """, ApplianceDetector.VERSION, id, ApplianceDetector.VERSION);
                if (updated == 0) {
                    return false;
                }
                jdbc.update("DELETE FROM recipe_appliances WHERE recipe_id = ?", id);
                for (String appliance : appliances) {
                    jdbc.update("INSERT INTO recipe_appliances (recipe_id, appliance) VALUES (?, ?)", id, appliance);
                }
                return true;
            });
            if (Boolean.TRUE.equals(claimed)) {
                read++;
            }
        }
        return read;
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

    /**
     * A household from before groups had icons has Full meal, Side and Veggie as plain tiles,
     * while a household made today starts with them drawn. Give those old groups the same icons
     * a new household's get, going by name — trimmed, any case — and never over one somebody
     * chose. "Main" has nothing obvious to draw, so it stays plain here too.
     */
    @Bean
    public ApplicationRunner offerOldGroupsTheirIcons(JdbcTemplate jdbc) {
        return args -> {
            try {
                int given = offerObviousGroupIcons(jdbc);
                if (given > 0) {
                    log.info("Gave {} recipe groups the icon their name suggests", given);
                }
            } catch (Exception e) {
                log.warn("Could not give recipe groups their icons: {}", e.getMessage());
            }
        };
    }

    /**
     * Offers each group its icon once, ever: a group is only looked at while its
     * {@code default_icon_offered_at} is still empty, and is marked as it is. Without that mark a
     * "no icon" somebody picks later would look exactly like never having had one, and the next
     * restart would put it back. Every group made since the column exists is marked as it is
     * made, so this only ever sees the old ones.
     *
     * The icons go on before the mark, so a start that dies in between leaves groups that are
     * simply offered again next time — and a group that got its icon is not touched twice,
     * because it has one. Returns how many groups got an icon.
     */
    public static int offerObviousGroupIcons(JdbcTemplate jdbc) {
        List<Object> params = new ArrayList<>();
        StringBuilder values = new StringBuilder();
        for (Map.Entry<String, String> entry : FoodIcons.DEFAULT_GROUP_ICONS.entrySet()) {
            values.append(values.isEmpty() ? "" : ", ").append("(?, ?)");
            params.add(entry.getKey().trim().toLowerCase(Locale.ROOT));
            params.add(entry.getValue());
        }
        int given = jdbc.update("""
                UPDATE recipe_categories c
                SET icon_key = d.icon
                FROM (VALUES %s) AS d(name, icon)
                WHERE c.default_icon_offered_at IS NULL
                  AND c.icon_key IS NULL
                  AND lower(trim(c.name)) = d.name
                """.formatted(values), params.toArray());
        jdbc.update("UPDATE recipe_categories SET default_icon_offered_at = now() WHERE default_icon_offered_at IS NULL");
        return given;
    }
}
