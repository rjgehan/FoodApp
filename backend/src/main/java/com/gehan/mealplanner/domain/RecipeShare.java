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
 * One recipe shared with one household. Sharing is an explicit list rather than a public flag,
 * so sending a recipe to your sister's house does not hand it to every household in the app.
 */
@Entity
@Table(name = "recipe_shares", uniqueConstraints = @UniqueConstraint(columnNames = {"recipe_id", "household_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecipeShare {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipe_id", nullable = false)
    private Recipe recipe;

    /** The household being shared *with*. The owner is Recipe.household. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    /**
     * When it was shared, for "shared 2 days ago" and the New pill on Shared with you. Null on
     * shares made before this was kept: they are simply not new.
     */
    @Column(name = "created_at")
    private Instant createdAt;
}
