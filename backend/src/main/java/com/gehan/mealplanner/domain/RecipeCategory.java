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
 * Groups nest: Chicken sits inside Main dish, so a drawer opens onto a handful of groups rather
 * than every recipe at once. One tree serves every drawer — Main dish means the same thing at
 * lunch and at dinner — and a drawer only shows the groups that have recipes in it.
 */
@Entity
@Table(name = "recipe_categories", uniqueConstraints = @UniqueConstraint(columnNames = {"household_id", "name"}))
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

    /** The group this one sits inside. Null for a group at the top of a drawer. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private RecipeCategory parent;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
