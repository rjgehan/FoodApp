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
 * Something a household has in the house, so you can check without going to look. Goes in
 * through "Done shopping" on the grocery list, or by hand, and comes out when it is used up.
 *
 * Have it, or running low — no count. When it is used up it either just goes (Remove, most of
 * the time) or goes onto the grocery list (Buy again). Nothing here adds to the list by itself.
 */
@Entity
@Table(name = "cupboard_items",
        uniqueConstraints = @UniqueConstraint(columnNames = {"household_id", "ingredient_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CupboardItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    /** The same shared ingredient the grocery list and recipes use, so "eggs" is one thing everywhere. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ingredient_id", nullable = false)
    private Ingredient ingredient;

    /**
     * Something you always have — salt, oil. Planned meals never put a staple on the grocery
     * list. This is what the grocery list's old "Pantry staples" became.
     */
    @Column(nullable = false)
    @Builder.Default
    private boolean staple = false;

    /**
     * Some left, but not much — a note for whoever checks, and nothing more. It does not put
     * anything on the grocery list. Planning does count it as not having enough, though, so a
     * planned item that is running low still goes on the list.
     *
     * The column carries its own default: Hibernate adds new columns to a table that already has
     * rows, and a bare NOT NULL there fails.
     */
    @Column(columnDefinition = "boolean not null default false")
    @Builder.Default
    private boolean runningLow = false;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
