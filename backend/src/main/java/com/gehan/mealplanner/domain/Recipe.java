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

    /**
     * The first link that is not a video, kept in step with {@link #links} for anything that
     * still reads the old single-link shape — older phones, and a rollback. Links are the truth.
     */
    @Column(length = RecipeSourceLink.MAX_URL)
    private String sourceUrl;

    /**
     * Published to Explore: every signed-in household on this server can read it and file it in
     * their own catalog. Off unless the household that owns it says otherwise, and reversible —
     * unpublishing takes it straight back out of Explore.
     *
     * The column carries its own default so Hibernate can add it to a table that already has rows.
     */
    @Column(nullable = false, columnDefinition = "boolean not null default false")
    @Builder.Default
    private boolean published = false;

    /** When it was last published, so Explore can lead with what is new. */
    private Instant publishedAt;

    /** The first video link, kept in step with {@link #links} the same way as sourceUrl. */
    @Column(length = RecipeSourceLink.MAX_URL)
    private String videoUrl;

    /** Every link worth keeping — where it came from, videos of it, variations. In order. */
    @OneToMany(mappedBy = "recipe", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    @Builder.Default
    private List<RecipeSourceLink> links = new ArrayList<>();

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
