package com.gehan.mealplanner.mealplans;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Somebody's own plan for a health target (mockup 5.10/5.11). Private: only the person who made
 * it can see it — not the rest of the household, not an admin page — because it is made from
 * their age, height and weight. Applying it puts its meals on the shared Plan, which is the only
 * part anyone else sees.
 *
 * Tied to the household it was made in, since "Yours" means that household's recipes. The body
 * details and the chosen meals are kept as JSON ({@link TargetPlanDtos.TargetDetails},
 * {@link TargetPlanDtos.StoredMeal}): they are only ever read whole, by their owner.
 */
@Entity
@Table(name = "target_plans", indexes = @Index(name = "idx_target_plans_owner", columnList = "ownerId, householdId"))
@Getter
@Setter
@NoArgsConstructor
public class TargetPlan {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID ownerId;

    @Column(nullable = false)
    private UUID householdId;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(nullable = false, columnDefinition = "text")
    private String details;

    @Column(nullable = false, columnDefinition = "text")
    private String meals;

    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(nullable = false)
    private Instant updatedAt = Instant.now();
}
