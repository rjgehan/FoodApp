package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.util.UUID;

/**
 * Somewhere a recipe lives on the web: the blog it came from, the TikTok of it being made, the
 * Instagram post with the sauce. A recipe has as many as anybody cares to keep, in the order
 * they were put there.
 *
 * Not to be confused with {@link RecipeLink}, which is the public share token — that one is a
 * way in to the recipe, this one is a way out of it.
 */
@Entity
@Table(name = "recipe_source_links")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecipeSourceLink {

    /** Long enough for a tracking-laden TikTok share link, short enough to be a link at all. */
    public static final int MAX_URL = 2048;
    public static final int MAX_LABEL = 60;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /*
     * ON DELETE CASCADE as well as the JPA cascade on Recipe, because household deletion clears
     * recipes with plain SQL and never goes through the entity.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipe_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Recipe recipe;

    /** Always http(s), normalized the same way as every other link the app stores. */
    @Column(nullable = false, length = MAX_URL)
    private String url;

    /** What to call it — "Grandma's version". Null means the app names it after the site. */
    @Column(length = MAX_LABEL)
    private String label;

    @Column(nullable = false)
    private int position;
}
