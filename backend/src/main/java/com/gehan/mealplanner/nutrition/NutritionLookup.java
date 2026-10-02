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
 * Something a person looked up on the Nutrition screen, for its "Recent lookups" list. Theirs
 * alone — not the household's — and only the latest few are kept.
 *
 * kind is FOOD (a USDA food, ref its fdc_id), PRODUCT (a barcode) or RECIPE (a recipe id).
 */
@Entity
@Table(name = "nutrition_lookups", uniqueConstraints = @UniqueConstraint(columnNames = {"userId", "kind", "ref"}))
@Getter
@NoArgsConstructor
public class NutritionLookup {

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 10)
    private String kind;

    @Column(nullable = false, length = 64)
    private String ref;

    @Column(nullable = false, length = 200)
    private String label;

    /** kcal and protein per 100 g for foods and products, per serving for recipes. */
    private Double kcal;

    private Double protein;

    private Instant lookedAt;
}
