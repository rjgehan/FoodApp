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

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
