package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.GroceryListItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface GroceryListItemRepository extends JpaRepository<GroceryListItem, UUID> {
    List<GroceryListItem> findByHouseholdId(UUID householdId);

    /**
     * Rows a new need can be added to. Unticked only: adding to something already in the cart
     * would hide the new need behind a tick. A list, because the same thing in two units that do
     * not add up is two rows.
     */
    List<GroceryListItem> findByHouseholdIdAndIngredientIdAndCheckedFalse(UUID householdId, UUID ingredientId);
}
