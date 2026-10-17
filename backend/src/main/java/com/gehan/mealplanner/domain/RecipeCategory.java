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
 * A household's own tag for recipes — "Chicken", "Quick", "Grandma's". Made from inside a drawer,
 * or by typing a new name while filing a recipe, and shared by everyone in the household the same
 * way recipes and meal plans are. The apps call them tags; the API still says recipe-categories,
 * which is what every phone already installed asks for.
 *
 * Tags are flat: a recipe wears as many as it likes, and a drawer is narrowed by tapping a few of
 * them, rather than by opening one group inside another. They used to nest, and a recipe filed in
 * Chicken was found under Main because Chicken sat inside it; TagMigration gave every such recipe
 * its old parents as tags of their own, so Main still finds them.
 *
 * A tag belongs to exactly one drawer, so Breakfast and Dinner can each have their own "Main"
 * without meaning the same thing, and renaming one never renames the other. Its name is unique
 * within that drawer, ignoring case.
 */
@Entity
// The name is unique within its drawer, ignoring case, which Hibernate cannot express (it is an
// index on lower(name)), so SchemaTouchUps owns that index instead.
@Table(name = "recipe_categories")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecipeCategory {

    /**
     * As long as the apps let a tag's name be typed. Checked on a new name only: a group from
     * before the limit keeps the name it has, and recipes filed under it still find it.
     */
    public static final int MAX_NAME = 100;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    @Column(nullable = false)
    private String name;

    /**
     * The drawer this tag belongs to. Groups made before drawers had none and showed in every
     * drawer — one row, so renaming it in Dinner renamed it in Lunch too. TagMigration gave each
     * of those the drawer most of its recipes are in, and then made the column NOT NULL; Hibernate
     * never tightens a column it has already made, so on an older database that is its doing.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RecipeSection section;

    /**
     * Which of the built-in food drawings its chip wears (see FoodIcons). Null is a plain chip —
     * what every group made before groups had icons is.
     */
    @Column(length = 40)
    private String iconKey;

    /**
     * When this tag was offered the obvious icon for its name (FoodIcons.DEFAULT_GROUP_ICONS).
     * A tag made now has had its chance as it is made — a new household's are seeded with
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
