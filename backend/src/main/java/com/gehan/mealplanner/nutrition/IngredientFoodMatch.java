package com.gehan.mealplanner.nutrition;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

/**
 * Which USDA food an ingredient is, shared by every household — "red lentils" is the same food
 * in every kitchen, so one person's (or one iPhone's) better choice improves it for everyone.
 *
 * AUTO is the server's own word matching, redone whenever the matcher or the table changes; AI
 * is an iPhone's on-device model choosing from the server's own shortlist; USER is a person
 * choosing. A person outranks a model, and a model outranks the word matching. A null food
 * means "not something we count" — water, say, or "paper towels".
 *
 * Written through JDBC upserts in {@link IngredientMatches}; mapped here so Hibernate makes the
 * table, the same additive way as every other table in the app.
 */
@Entity
@Table(name = "ingredient_food_matches")
@Getter
@NoArgsConstructor
public class IngredientFoodMatch {

    public enum Source { AUTO, AI, USER }

    @Id
    private UUID ingredientId;

    private Integer fdcId;

    @Column(nullable = false)
    private double confidence;

    @Column(nullable = false, length = 8)
    private String source;

    /** The matcher's version and the table's, for AUTO rows: either changing means redo it. */
    private int matcherVersion;

    @Column(length = 80)
    private String dataVersion;

    private Instant updatedAt;

    private UUID updatedBy;
}
