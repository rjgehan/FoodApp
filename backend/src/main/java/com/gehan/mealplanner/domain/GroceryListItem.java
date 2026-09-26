package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "grocery_list_items")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroceryListItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    /** Null when this is a free-text item added manually rather than aggregated from a recipe. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ingredient_id")
    private Ingredient ingredient;

    private String customName;

    private BigDecimal quantity;
    private String unit;

    /**
     * How much of {@link #quantity} each planned meal put here, by meal plan entry id. It is how
     * a meal whose servings went down, or that no longer uses something, takes back just its own
     * part — never what was typed in by hand, which is the rest of the quantity and is not
     * listed here. It is also what one meal's own "Add to Groceries" counts as already there.
     *
     * What the week's button counts as added is kept on the entry instead
     * ({@link MealPlanEntry#getAddedToGroceries()}), since it has to outlive this row. No
     * foreign key to the entry: a meal deleted from the plan leaves its share behind as a plain
     * number, which nothing reads.
     */
    @ElementCollection
    @CollectionTable(name = "grocery_list_item_meals", joinColumns = @JoinColumn(name = "grocery_list_item_id"))
    @MapKeyColumn(name = "meal_plan_entry_id")
    @Column(name = "quantity", precision = 38, scale = 2, nullable = false)
    @BatchSize(size = 100)
    @Builder.Default
    private Map<UUID, BigDecimal> fromMeals = new HashMap<>();

    @Column(nullable = false)
    @Builder.Default
    private boolean checked = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "checked_by_user_id")
    private User checkedBy;

    private Instant checkedAt;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
