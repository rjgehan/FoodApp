package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.BlacklistedIngredient;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public interface BlacklistedIngredientRepository extends JpaRepository<BlacklistedIngredient, UUID> {
    List<BlacklistedIngredient> findByHouseholdId(UUID householdId);

    Optional<BlacklistedIngredient> findByHouseholdIdAndIngredientId(UUID householdId, UUID ingredientId);

    boolean existsByHouseholdIdAndIngredientId(UUID householdId, UUID ingredientId);

    @org.springframework.data.jpa.repository.Query(
            "select b.ingredient.id from BlacklistedIngredient b where b.household.id = :householdId")
    Set<UUID> findBlacklistedIngredientIds(UUID householdId);
}
