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
 * Something a household keeps in the house, so you can check whether you have it without going
 * to look. Goes in through "Done shopping" on the grocery list, or by hand.
 *
 * An item marked OUT stays here rather than disappearing: the cupboard doubles as the list of
 * things you normally have, and putting the shopping away flips it straight back to HAVE.
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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private StockStatus status = StockStatus.HAVE;

    /**
     * Something you always have — salt, oil. Planned meals never put a staple on the grocery
     * list. This is what the grocery list's old "Pantry staples" became.
     */
    @Column(nullable = false)
    @Builder.Default
    private boolean staple = false;

    @Column(nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
