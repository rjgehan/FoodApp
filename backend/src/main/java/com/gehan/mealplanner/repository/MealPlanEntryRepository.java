package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.MealPlanEntry;
import com.gehan.mealplanner.domain.MealType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface MealPlanEntryRepository extends JpaRepository<MealPlanEntry, UUID> {

    /** Used when a place is deleted, so the plan never points at something that is gone. */
    void deleteByPlaceId(UUID placeId);

    /**
     * Every meal, in any household, planned with a recipe — for deleting it, which removes the
     * owner's own meals and leaves the others' marked as deleted.
     */
    List<MealPlanEntry> findByRecipeId(UUID recipeId);

    long countByRecipeId(UUID recipeId);

    /** Meals planned with a saved link, for when it is deleted or becomes a recipe. */
    List<MealPlanEntry> findBySavedLinkId(UUID savedLinkId);

    List<MealPlanEntry> findByHouseholdIdAndDateBetweenOrderByDateAscMealTypeAsc(
            UUID householdId, LocalDate start, LocalDate end);

    /** A slot holds several recipes now — a main plus its sides — so this is a list, not an Optional. */
    List<MealPlanEntry> findByHouseholdIdAndDateAndMealTypeOrderByCreatedAtAsc(
            UUID householdId, LocalDate date, MealType mealType);

    /**
     * The planned meals that have put something on this household's grocery list, as
     * [entry id, recipe name] — so a row can say which recipes it is for. One query for the whole
     * list. Meals without a recipe (a single item, a recipe since deleted) are left out.
     */
    @Query("select e.id, r.name from MealPlanEntry e join e.recipe r "
            + "where e.household.id = :householdId and e.id in "
            + "(select key(m) from GroceryListItem g join g.fromMeals m where g.household.id = :householdId)")
    List<Object[]> recipeNamesOnList(@Param("householdId") UUID householdId);
}
