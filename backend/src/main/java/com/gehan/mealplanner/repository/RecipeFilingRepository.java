package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.RecipeFiling;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RecipeFilingRepository extends JpaRepository<RecipeFiling, UUID> {
    List<RecipeFiling> findByHouseholdId(UUID householdId);
    Optional<RecipeFiling> findByHouseholdIdAndRecipeId(UUID householdId, UUID recipeId);
    void deleteByRecipeId(UUID recipeId);

    /** Every household's filing of these recipes — for finding which drawer the owner keeps each in. */
    List<RecipeFiling> findByRecipeIdIn(java.util.Collection<UUID> recipeIds);
}
