package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "recipe_ingredients")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecipeIngredient {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipe_id", nullable = false)
    private Recipe recipe;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ingredient_id", nullable = false)
    private Ingredient ingredient;

    /**
     * Null means no amount was given — "salt and pepper", "oil for frying" — which reads as
     * "some", not as 1. Older rows were saved as 1 by forms that had no way to say nothing; a
     * database made before this was nullable is relaxed by SchemaTouchUps.
     */
    @Column(precision = 10, scale = 2)
    private BigDecimal quantity;

    private String unit;

    private String notes;

    /**
     * Something a cook might skip — chosen per occasion when the recipe is planned onto a meal.
     * columnDefinition gives existing rows a real value when this column is first added, rather
     * than the bare `NOT NULL` add failing outright on a table that already has rows.
     */
    @Column(nullable = false, columnDefinition = "boolean not null default false")
    @Builder.Default
    private boolean optional = false;
}
