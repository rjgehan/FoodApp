package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "recipes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Recipe {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    @Column(nullable = false)
    private String name;

    @Column(columnDefinition = "text")
    private String description;

    @Column(columnDefinition = "text")
    private String instructions;

    private Integer prepTimeMinutes;
    private Integer cookTimeMinutes;

    /** How many people this recipe's ingredient quantities, as written, actually serve. */
    @Column(nullable = false)
    private int servings;

    private String sourceUrl;

    /** Link to a video of the recipe being made — usually TikTok. Always http(s); see RecipeService. */
    private String videoUrl;

    /** The one picture shown at the top of the recipe. Optional. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cover_image_id")
    private StoredImage coverImage;

    /** Everything else worth keeping — process shots, the finished plate, grandma's handwriting. */
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(name = "recipe_photos",
            joinColumns = @JoinColumn(name = "recipe_id"),
            inverseJoinColumns = @JoinColumn(name = "image_id"))
    @OrderColumn(name = "position")
    @Builder.Default
    private List<StoredImage> photos = new ArrayList<>();

    @OneToMany(mappedBy = "recipe", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<RecipeIngredient> ingredients = new ArrayList<>();

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
