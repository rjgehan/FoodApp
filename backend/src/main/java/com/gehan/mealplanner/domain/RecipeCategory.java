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

    /**
     * Which of the built-in food drawings its tile wears (see FoodIcons). Null is a plain colour
     * tile — what every group made before groups had icons is.
     */
    @Column(length = 40)
    private String iconKey;

    /**
     * When this group was offered the obvious icon for its name (FoodIcons.DEFAULT_GROUP_ICONS).
     * A group made now has had its chance as it is made — a new household's are seeded with
     * theirs, and one made by hand wears whatever it was given — so only a group from before
     * group icons is ever null here. StartupBackfills offers those theirs once and fills this
     * in, so an icon somebody takes off later stays off through every restart after.
     */
    @Builder.Default
    private Instant defaultIconOfferedAt = Instant.now();

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
