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
 * A household's own label for recipes — "Grandma's", "Kid approved", "Freezer". Created by
 * typing a new name while tagging a recipe, and shared by everyone in the household, the same
 * way recipes and meal plans are.
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

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
