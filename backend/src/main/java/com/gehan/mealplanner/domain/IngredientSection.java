package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/**
 * Where one household keeps one ingredient — tortillas with the bread at their store, say, or
 * wherever Sort put it. This is the only place a household's own placement lives now; there is no
 * more shared default to fall back to once every household can have its own categories, only the
 * keyword/Gemini guess on {@link Ingredient#getSection()}, used as an internal hint for placing an
 * item into one of *this* household's categories for the first time. Per household, because
 * stores — and now category lists — really do differ.
 */
@Entity
@Table(name = "ingredient_sections",
        uniqueConstraints = @UniqueConstraint(columnNames = {"household_id", "ingredient_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IngredientSection {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ingredient_id", nullable = false)
    private Ingredient ingredient;

    /**
     * Nullable only so Hibernate's ddl-auto=update can add this column to a database that already
     * has rows — every row the app writes always sets it. See StartupBackfills for migrating rows
     * from before this column existed.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private GroceryCategory category;
}
