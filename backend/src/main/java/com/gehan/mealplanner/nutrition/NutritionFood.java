package com.gehan.mealplanner.nutrition;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One food from USDA FoodData Central, per 100 g — the table every ingredient is weighed against.
 *
 * Mapped so Hibernate makes the table, but written only by {@link UsdaTableLoader} and read once
 * into {@link FoodTable}; nothing edits a row. The id is USDA's own (fdc_id), so a match stored
 * against it means the same food after a reload.
 */
@Entity
@Table(name = "nutrition_foods")
@Getter
@NoArgsConstructor
public class NutritionFood {

    @Id
    private Integer fdcId;

    /** "sr" for SR Legacy, "fo" for Foundation Foods. */
    @Column(nullable = false, length = 4)
    private String source;

    @Column(length = 120)
    private String category;

    @Column(nullable = false, length = 400)
    private String name;

    private Double kcal;
    private Double protein;
    private Double carbs;
    private Double fat;
    private Double fibre;
    private Double sugars;
    private Double sodiumMg;
    private Double satFat;
    private Double ironMg;
    private Double calciumMg;
    @Column(name = "vitamin_c_mg")
    private Double vitaminCMg;
    private Double potassiumMg;
}
