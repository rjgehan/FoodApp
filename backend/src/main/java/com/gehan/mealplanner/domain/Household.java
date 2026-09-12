package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "households")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Household {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    /** How many people a meal plan slot defaults to when no servings are specified. */
    @Column(nullable = false)
    @Builder.Default
    private int defaultServings = 4;

    /** How many days out (starting today) are spotlighted on the meal plan calendar as needing meals. */
    @Column(nullable = false)
    @Builder.Default
    private int planningHorizonDays = 7;

    /**
     * The aisles in the order this household walks its store, comma-separated; null means the
     * default. Text rather than a join table because it is one short ordered list that is only
     * ever read and written whole. Read it through {@link #storeSections()}.
     */
    @Column(length = 500)
    private String storeSectionOrder;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    /** Every section exactly once, in this household's order. */
    public List<StoreSection> storeSections() {
        return StoreSection.orderFrom(storeSectionOrder);
    }
}
