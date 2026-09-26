package com.gehan.mealplanner.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * How much of one thing a planned meal has put on the grocery list, in one unit — see
 * {@link MealPlanEntry#getAddedToGroceries()}. The unit is the one spelling
 * ({@code IngredientLine.canonicalUnit}), so "cans" and "can" are one share; null is no unit.
 */
@Embeddable
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class GroceryShare {

    @Column(name = "ingredient_id", nullable = false)
    private UUID ingredientId;

    private String unit;

    @Column(precision = 38, scale = 2, nullable = false)
    private BigDecimal quantity;
}
