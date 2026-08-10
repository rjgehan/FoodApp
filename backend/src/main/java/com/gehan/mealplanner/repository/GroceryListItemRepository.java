package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.GroceryListItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GroceryListItemRepository extends JpaRepository<GroceryListItem, UUID> {
    List<GroceryListItem> findByHouseholdId(UUID householdId);

    Optional<GroceryListItem> findByHouseholdIdAndIngredientIdAndUnit(
            UUID householdId, UUID ingredientId, String unit);
}
