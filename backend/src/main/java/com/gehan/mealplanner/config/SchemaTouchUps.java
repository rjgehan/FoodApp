package com.gehan.mealplanner.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

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
}
