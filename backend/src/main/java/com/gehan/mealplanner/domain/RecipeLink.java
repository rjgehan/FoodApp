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
 * A link that shows one recipe to someone with no account at all — the thing you text to a
 * friend who asks how you made it.
 *
 * The token, not a login, is the credential: 256 bits of randomness, so the only way to reach
 * the recipe is to be given the URL. One per recipe, revocable, and it exposes nothing but the
 * recipe itself — no household, no members, no other recipes.
 */
@Entity
@Table(name = "recipe_links", uniqueConstraints = @UniqueConstraint(columnNames = "token"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecipeLink {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** URL-safe base64 of 32 random bytes. Unguessable, and short enough to paste in a message. */
    @Column(nullable = false, unique = true, length = 64)
    private String token;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipe_id", nullable = false, unique = true)
    private Recipe recipe;

    @Column(nullable = false)
    private Instant createdAt;
}
