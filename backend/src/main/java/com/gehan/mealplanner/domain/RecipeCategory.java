package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * A household's own group for recipes — "Main dish", "Chicken", "Grandma's". Created by typing
 * a new name while filing a recipe, or from inside a drawer, and shared by everyone in the
 * household the same way recipes and meal plans are.
 *
 * Groups nest: Chicken sits inside Main, so a drawer opens onto a handful of groups rather than
 * every recipe at once.
 *
 * A group belongs to one drawer, so Breakfast and Dinner can each have their own "Main" without
 * meaning the same thing. A group with no drawer (`section == null`) shows in all of them — that
 * is what every group made before drawers were part of a group is, and what a household's own
 * cross-cutting groups ("Grandma's") can stay.
 */
@Entity
// The name is unique within its drawer, which Hibernate cannot express (nulls would slip
// through), so SchemaTouchUps owns that index instead.
@Table(name = "recipe_categories")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecipeCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    @Column(nullable = false)
    private String name;

    /** The drawer this group belongs to. Null means it shows in every drawer. */
    @Enumerated(EnumType.STRING)
    private RecipeSection section;

    /** The group this one sits inside. Null for a group at the top of a drawer. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private RecipeCategory parent;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
