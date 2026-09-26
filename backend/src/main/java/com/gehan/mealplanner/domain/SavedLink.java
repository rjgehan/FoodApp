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
 * A recipe kept as nothing more than a link: a name, the address, and its picture.
 *
 * Most of what people want to cook next is a TikTok or a Reel they scrolled past, and most of
 * those cannot be read into a recipe — the recipe is spoken, or behind a link in a bio. Before
 * this, a link that could not be read was an error and then nothing. Now it is kept, so the
 * list of things to try lives in the app beside the recipes rather than in a camera roll.
 *
 * It belongs to the household, like a recipe, and everyone in it sees it — unless the person who
 * saved it marked it {@link #personal}, which is for the ones nobody else needs to see.
 */
@Entity
@Table(name = "saved_links")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SavedLink {

    public static final int MAX_NAME = 200;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    /**
     * Who saved it. Null once their account is deleted: the household's links stay with the
     * household, the way its recipes do, and nobody is left who could make one "just me".
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id")
    private User createdBy;

    /**
     * Just me: only {@link #createdBy} sees it. Off by default — a household saving recipes to
     * try is usually saving them for each other. The column carries its own default so Hibernate
     * can add it to a table that already has rows.
     */
    @Column(nullable = false, columnDefinition = "boolean not null default false")
    @Builder.Default
    private boolean personal = false;

    /** Always http(s), cleaned by {@link com.gehan.mealplanner.service.SavedLinks#clean}. */
    @Column(nullable = false, length = RecipeSourceLink.MAX_URL)
    private String url;

    @Column(nullable = false, length = MAX_NAME)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SavedLinkSource source;

    /** The video's cover or the page's picture, fetched once when it was saved. Optional. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cover_image_id")
    private StoredImage coverImage;

    /** The drawer it would go in as a recipe, for filtering the list. Optional. */
    @Enumerated(EnumType.STRING)
    private RecipeSection section;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();
}
