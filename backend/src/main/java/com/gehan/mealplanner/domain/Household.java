package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "households")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Household {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    /** How many people a meal plan slot defaults to when no servings are specified. */
    @Column(nullable = false)
    @Builder.Default
    private int defaultServings = 4;

    /** How many days out (starting today) are spotlighted on the meal plan calendar as needing meals. */
    @Column(nullable = false)
    @Builder.Default
    private int planningHorizonDays = 7;

    /**
     * Whether this household keeps track of its cupboard. Recipes and the grocery list are the
     * app; the cupboard only earns its keep for somebody who updates it after shopping and
     * cooking, so a household made today starts without it and turns it on if it wants it.
     *
     * Null on a household from before it was a choice, until StartupBackfills decides — on for
     * one that has anything in its cupboard, off for one that never used it. Read it through
     * {@link #isCupboardEnabled}, which takes a null as on: until then, nothing it had goes missing.
     */
    private Boolean cupboardEnabled;

    /**
     * Whether this household plans its meals ahead. On unless it says otherwise — every household
     * from before it was a choice planned, and keeps the Plan tab. Off, the plan's rows stay
     * where they are, only out of sight.
     *
     * The column carries its own default so Hibernate can add it to a table that already has rows.
     */
    @Column(nullable = false, columnDefinition = "boolean not null default true")
    @Builder.Default
    private boolean planEnabled = true;

    /**
     * When somebody here answered the kitchen questions — machines, planning, cupboard — or
     * skipped them. Null until then, which is what has the apps offer them: to whoever made the
     * household and, while nobody has answered, to whoever joins it.
     */
    private Instant kitchenSetUpAt;

    /**
     * The kitchen machines this household has, as KitchenMachines keys. Kept for what comes next —
     * suggesting what they can make — and shown in the kitchen settings. Strings rather than an
     * enum column, for the reason KitchenMachines gives. No order: answers put them in the
     * catalogue's. Batched, because the household list reads every household's at once.
     */
    @ElementCollection
    @CollectionTable(name = "household_machines", joinColumns = @JoinColumn(name = "household_id"))
    @Column(name = "machine", length = 40)
    @BatchSize(size = 100)
    @Builder.Default
    private Set<String> machines = new HashSet<>();

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    /** A household from before the cupboard was optional keeps it until the backfill has looked. */
    public boolean isCupboardEnabled() {
        return cupboardEnabled == null || cupboardEnabled;
    }
}
