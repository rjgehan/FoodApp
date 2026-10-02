package com.gehan.mealplanner.mealplans;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface TargetPlanRepository extends JpaRepository<TargetPlan, UUID> {

    /** One person's plans in one household, newest change first. Nobody else's, ever. */
    List<TargetPlan> findByOwnerIdAndHouseholdIdOrderByUpdatedAtDesc(UUID ownerId, UUID householdId);
}
