package com.gehan.mealplanner.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

/**
 * Hibernate's ddl-auto=update only ever adds tables and columns — it never relaxes a constraint
 * on a column that already exists. Accounts now start life without a PIN, so users.password_hash
 * has to become nullable on databases created before that change. Postgres treats DROP NOT NULL
 * on an already-nullable column as a no-op, so this is safe to run on every startup, including
 * against a fresh database where Hibernate got the mapping right to begin with.
 *
 * If this project ever grows real migrations (Flyway/Liquibase), fold this in and delete it.
 */
@Configuration
public class SchemaTouchUps {

    private static final Logger log = LoggerFactory.getLogger(SchemaTouchUps.class);

    @Bean
    public ApplicationRunner relaxLegacyPasswordHashConstraint(JdbcTemplate jdbc) {
        return args -> {
            try {
                jdbc.execute("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL");
            } catch (Exception e) {
                // Worst case the constraint is already gone or the table isn't there yet on a
                // brand new database; neither is worth refusing to boot over.
                log.warn("Could not relax users.password_hash nullability: {}", e.getMessage());
            }
        };
    }

    /**
     * ingredient_sections.section was the old fixed-enum placement, NOT NULL; a household's
     * placement is a GroceryCategory row now (see IngredientSection), so nothing writes that
     * column any more, but Hibernate never relaxes a constraint on a column it no longer maps —
     * every new placement would otherwise fail this check on a database from before categories
     * existed. The column itself is kept, unmapped, since StartupBackfills still reads it once to
     * migrate old placements onto their household's matching category.
     */
    @Bean
    public ApplicationRunner relaxLegacyIngredientSectionConstraint(JdbcTemplate jdbc) {
        return args -> {
            try {
                jdbc.execute("ALTER TABLE ingredient_sections ALTER COLUMN section DROP NOT NULL");
            } catch (Exception e) {
                log.warn("Could not relax ingredient_sections.section nullability: {}", e.getMessage());
            }
        };
    }

    /**
     * The cupboard briefly tracked Have/Low/Out. A database started on that version has NOT NULL
     * status and updated_at columns that nothing writes any more, so every new cupboard item would
     * fail on them. IF EXISTS makes this a no-op everywhere else.
     */
    @Bean
    public ApplicationRunner dropCupboardStockColumns(JdbcTemplate jdbc) {
        return args -> {
            try {
                jdbc.execute("ALTER TABLE cupboard_items DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS updated_at");
            } catch (Exception e) {
                log.warn("Could not drop the old cupboard stock columns: {}", e.getMessage());
            }
        };
    }

    /**
     * Hibernate writes a CHECK constraint listing an enum's values when it creates the column, and
     * never updates it — so an aisle added later, like Baking or Spices, is refused by every
     * database made before it. The list of aisles is the enum's job; this drops the stale copy.
     * Runs before the data backfills, which may be about to write one of the new values.
     */
    @Bean
    @Order(0)
    public ApplicationRunner dropStoreSectionValueChecks(JdbcTemplate jdbc) {
        return args -> {
            try {
                List<Map<String, Object>> checks = jdbc.queryForList("""
                        SELECT conrelid::regclass::text AS tbl, conname
                        FROM pg_constraint
                        WHERE contype = 'c'
                          AND conrelid IN ('ingredients'::regclass, 'ingredient_sections'::regclass)
                          AND pg_get_constraintdef(oid) LIKE '%PRODUCE%'
                        """);
                for (Map<String, Object> check : checks) {
                    jdbc.execute("ALTER TABLE " + check.get("tbl") + " DROP CONSTRAINT \"" + check.get("conname") + "\"");
                }
            } catch (Exception e) {
                log.warn("Could not drop the store section value checks: {}", e.getMessage());
            }
        };
    }

    /**
     * Group names used to be unique per household, which is why there could only ever be one
     * "Main". They belong to a drawer now, so Breakfast and Dinner can each have their own — the
     * old constraint has to go, and the scoped one takes its place. COALESCE keeps drawer-less
     * groups (the ones made before this, and any the household keeps that way) unique too, which a
     * plain unique index would not: in SQL, NULLs never equal each other.
     */
    @Bean
    @Order(0)
    public ApplicationRunner scopeRecipeGroupNamesToTheirDrawer(JdbcTemplate jdbc) {
        return args -> {
            try {
                List<Map<String, Object>> old = jdbc.queryForList("""
                        SELECT conname
                        FROM pg_constraint
                        WHERE contype = 'u'
                          AND conrelid = 'recipe_categories'::regclass
                          AND pg_get_constraintdef(oid) NOT LIKE '%section%'
                        """);
                for (Map<String, Object> constraint : old) {
                    jdbc.execute("ALTER TABLE recipe_categories DROP CONSTRAINT \"" + constraint.get("conname") + "\"");
                }
                // The old constraint compared names exactly, so one household could hold both
                // "Chicken" and "chicken" — which the app has always treated as one group, and
                // which the new index will not allow. Fold them into the oldest of each set
                // first, or the index cannot be built and nothing keeps group names unique.
                int merged = mergeCaseDuplicateGroups(jdbc);
                if (merged > 0) {
                    log.info("Merged {} duplicate recipe group(s) that differed only by case.", merged);
                }
                jdbc.execute("""
                        CREATE UNIQUE INDEX IF NOT EXISTS uk_recipe_categories_drawer_name
                        ON recipe_categories (household_id, COALESCE(section, ''), lower(name))
                        """);
            } catch (Exception e) {
                log.warn("Could not scope recipe group names to their drawer: {}", e.getMessage());
            }
        };
    }


    /**
     * Folds groups that differ only by case into the oldest of their set: its children and the
     * recipes filed under it move across, then the duplicate row goes. Returns how many went.
     */
    private static int mergeCaseDuplicateGroups(JdbcTemplate jdbc) {
        String duplicates = """
                WITH ranked AS (
                  SELECT id, household_id,
                         first_value(id) OVER w AS keeper,
                         row_number() OVER w AS rn
                  FROM recipe_categories
                  WINDOW w AS (
                    PARTITION BY household_id, COALESCE(section, ''), lower(name)
                    ORDER BY created_at, id)
                )
                SELECT id, keeper FROM ranked WHERE rn > 1
                """;

        // Children first, so nothing is orphaned when the duplicate row goes.
        jdbc.update("UPDATE recipe_categories c SET parent_id = d.keeper FROM (" + duplicates
                + ") d WHERE c.parent_id = d.id");
        // A recipe filed under both spellings would collide on the join table's key.
        jdbc.update("DELETE FROM recipe_filing_categories f USING (" + duplicates + ") d "
                + "WHERE f.category_id = d.id AND EXISTS ("
                + "  SELECT 1 FROM recipe_filing_categories keep "
                + "  WHERE keep.filing_id = f.filing_id AND keep.category_id = d.keeper)");
        jdbc.update("UPDATE recipe_filing_categories f SET category_id = d.keeper FROM (" + duplicates
                + ") d WHERE f.category_id = d.id");
        return jdbc.update("DELETE FROM recipe_categories c USING (" + duplicates + ") d WHERE c.id = d.id");
    }

    /**
     * The unit box used to send "" for no unit, and planned items send nothing at all — so the
     * same "eggs" could sit on the list twice, once per spelling of empty. Empty is null now.
     */
    @Bean
    public ApplicationRunner blankGroceryUnitsToNull(JdbcTemplate jdbc) {
        return args -> {
            try {
                jdbc.update("UPDATE grocery_list_items SET unit = NULL WHERE unit = ''");
            } catch (Exception e) {
                log.warn("Could not tidy empty grocery units: {}", e.getMessage());
            }
        };
    }
}
