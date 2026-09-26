package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.RestockReminder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RestockReminderRepository extends JpaRepository<RestockReminder, UUID> {
    List<RestockReminder> findByHouseholdId(UUID householdId);

    Optional<RestockReminder> findByHouseholdIdAndIngredientId(UUID householdId, UUID ingredientId);
}
