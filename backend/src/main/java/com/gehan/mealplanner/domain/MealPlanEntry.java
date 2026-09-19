package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * A single meal slot on the household calendar (e.g. "Tuesday dinner").
 * Holds exactly one of: a {@link #recipe} you cook, a {@link #place} you eat at, or a single
 * {@link #item} — just eggs, just strawberries. A slot with none of them is simply empty.
 */
@Entity
@Table(name = "meal_plan_entries")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MealPlanEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    @Column(nullable = false)
    private LocalDate date;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MealType mealType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipe_id")
    private Recipe recipe;

    /** Set instead of {@link #recipe} when the plan is to eat out rather than cook. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "place_id")
    private Place place;

    /**
     * A single food rather than a dish — eggs for breakfast. The shared ingredient, so it lines up
     * with the cupboard and the grocery list: if it is not in the cupboard, planning it is what
     * puts it on the list. Making eggs a one-ingredient recipe would clutter the recipe book.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ingredient_id")
    private Ingredient item;

    /**
     * When you are sitting down, for the occasions that have a time — a booking, a pickup slot.
     * Optional, and on the entry rather than the Place: "Columns" is somewhere you go often,
     * "Columns at 5" is one particular Tuesday.
     */
    private LocalTime time;

    private Integer servings;

    private String notes;

    /**
     * Which of the recipe's optional ingredients to actually buy for this occurrence — decided
     * once, when the recipe is planned onto this slot, rather than asked again every time
     * something adds this entry to the grocery list. An id no longer on the recipe (edited since)
     * is simply ignored wherever this is read.
     */
    @ElementCollection
    @CollectionTable(name = "meal_plan_entry_included_optionals", joinColumns = @JoinColumn(name = "entry_id"))
    @Column(name = "recipe_ingredient_id")
    @Builder.Default
    private Set<UUID> includedOptionalIngredientIds = new HashSet<>();

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    /**
     * Day, then breakfast → lunch → dinner → snack, then the order things were added — so a main
     * comes before the sides added to it. The database can't do this: meal types are stored as
     * text, which sorts DINNER before LUNCH, and it has no fixed order within a meal.
     */
    public static final Comparator<MealPlanEntry> EATING_ORDER = Comparator
            .comparing(MealPlanEntry::getDate)
            .thenComparing(MealPlanEntry::getMealType)
            .thenComparing(MealPlanEntry::getCreatedAt);
}
