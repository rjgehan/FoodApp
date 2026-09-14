package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
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

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
