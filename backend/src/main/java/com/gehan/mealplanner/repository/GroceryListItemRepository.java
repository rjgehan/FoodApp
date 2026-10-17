package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.GroceryListItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface GroceryListItemRepository extends JpaRepository<GroceryListItem, UUID> {
    List<GroceryListItem> findByHouseholdId(UUID householdId);

    /**
     * The recipes added straight to this household's list from their pages, as [recipe id,
     * name] — so a row can say which recipes it is for. One query for the whole list. A recipe
     * since deleted is left out.
     */
    @Query("select r.id, r.name from Recipe r where r.id in "
            + "(select f from GroceryListItem g join g.fromRecipeIds f where g.household.id = :householdId)")
    List<Object[]> recipeNamesOnList(@Param("householdId") UUID householdId);

    /**
     * Rows a new need can be added to. Unticked only: adding to something already in the cart
     * would hide the new need behind a tick. A list, because the same thing in two units that do
     * not add up is two rows.
     */
    List<GroceryListItem> findByHouseholdIdAndIngredientIdAndCheckedFalse(UUID householdId, UUID ingredientId);
}
