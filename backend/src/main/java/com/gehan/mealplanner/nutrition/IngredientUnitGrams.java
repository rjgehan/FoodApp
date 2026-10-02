package com.gehan.mealplanner.nutrition;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

/**
 * What one of a unit of an ingredient weighs — a "knob" of butter, a "handful" of spinach, one
 * chicken breast — shared by every household like the match itself.
 *
 * RULE rows are the server's own working-out ({@link Grams}), kept so it can be seen which
 * amounts are guesses and refreshed when the rules or the match change. AI rows come from an
 * iPhone's model, USER rows from a person; either replaces the rule, and a person outranks a model.
 * The unit is {@link Grams#unitKey}: "" for a plain count, "tbsp", "knob", "large".
 */
@Entity
@Table(name = "ingredient_unit_grams",
        uniqueConstraints = @UniqueConstraint(columnNames = {"ingredientId", "unitKey"}))
@Getter
@NoArgsConstructor
public class IngredientUnitGrams {

    public enum Source { RULE, AI, USER }

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID ingredientId;

    @Column(nullable = false, length = 40)
    private String unitKey;

    @Column(nullable = false)
    private double gramsEach;

    @Column(nullable = false, length = 8)
    private String source;

    /** For RULE rows: the food it was worked out against, so a new match redoes it. */
    private Integer fdcId;

    @Column(length = 200)
    private String basis;

    private Instant updatedAt;

    private UUID updatedBy;
}
