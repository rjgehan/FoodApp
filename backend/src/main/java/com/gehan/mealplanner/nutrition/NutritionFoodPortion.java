package com.gehan.mealplanner.nutrition;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * A household measure of a USDA food and what it weighs: "1 large" egg = 50 g, "1 cup, chopped"
 * onion = 160 g. These are what turn "2 eggs" and "1 tbsp olive oil" into grams; see {@link Grams}.
 */
@Entity
@Table(name = "nutrition_food_portions")
@IdClass(NutritionFoodPortion.Key.class)
@Getter
@NoArgsConstructor
public class NutritionFoodPortion {

    @Id
    private Integer fdcId;

    @Id
    private Integer position;

    /** How many of the measure the grams are for — "0.5 cup" is 0.5. */
    @Column(nullable = false)
    private double amount;

    /** The measure as USDA words it, without the amount: "large", "cup, chopped". */
    @Column(nullable = false, length = 200)
    private String label;

    @Column(nullable = false)
    private double grams;

    @lombok.EqualsAndHashCode
    @NoArgsConstructor
    public static class Key implements Serializable {
        private Integer fdcId;
        private Integer position;
    }
}
