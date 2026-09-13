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
