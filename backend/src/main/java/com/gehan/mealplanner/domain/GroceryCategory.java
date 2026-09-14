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
 * A household's own aisle — "Produce", or "Pharmacy" if their store has one and the default list
 * never did. Replaces the fixed {@link StoreSection} enum as what a household actually sees and
 * edits; {@code position} is the order they walk their store in.
 *
 * {@code seededFrom} is never shown to the household — it is only how the free keyword pass
 * (which only knows the original twelve) can still place an item for free when a category still
 * means roughly what its default did. A brand new category, or one repurposed away from its
 * default meaning, simply has no keyword shortcut and waits for the Sort button or a manual move,
 * same as any other unsorted item.
 */
@Entity
@Table(name = "grocery_categories", uniqueConstraints = @UniqueConstraint(columnNames = {"household_id", "name"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroceryCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private int position;

    @Enumerated(EnumType.STRING)
    private StoreSection seededFrom;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
