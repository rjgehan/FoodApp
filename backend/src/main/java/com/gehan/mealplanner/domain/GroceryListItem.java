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
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
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

    /**
     * The recipes added to the list straight from their page — no planned meal behind them — that
     * this row is for, by recipe id. Only for saying so: "for Lasagne" beside the row, and whether
     * a recipe's things are still waiting on the list before it is added a second time. What the
     * row asks for is in {@link #quantity} like anything typed in, and such a row is
     * {@link #askedFor}, so nothing is ever taken back off it on a recipe's behalf.
     *
     * No foreign key to the recipe: one deleted since leaves its id behind, which no name is
     * found for.
     */
    @ElementCollection
    @CollectionTable(name = "grocery_list_item_recipes", joinColumns = @JoinColumn(name = "grocery_list_item_id"))
    @Column(name = "recipe_id", nullable = false)
    @BatchSize(size = 100)
    @Builder.Default
    private Set<UUID> fromRecipeIds = new HashSet<>();

    /**
     * Somebody put this on the list themselves — typed it, pressed Buy again, added a planned
     * single item or a recipe from its page — rather than it being here only for planned meals. A typed "salt" and a
     * meal's "salt, to taste" both have no amount, so without this a meal taken off the plan
     * would take the salt somebody asked for with it. Only the server reads it.
     *
     * The column carries its own default: Hibernate adds new columns to a table that already has
     * rows, and a bare NOT NULL there fails.
     */
    @Column(nullable = false, columnDefinition = "boolean not null default false")
    @Builder.Default
    private boolean askedFor = false;

    @Column(nullable = false)
    @Builder.Default
    private boolean checked = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "checked_by_user_id")
    private User checkedBy;

    private Instant checkedAt;

    /**
     * Who typed it in or pressed Buy again — the first person to ask for it, kept when someone
     * else asks again. Null for rows only meals put here, and for rows from before it was kept.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "added_by_user_id")
    private User addedBy;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
