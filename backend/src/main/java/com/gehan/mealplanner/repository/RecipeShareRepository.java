package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.RecipeShare;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RecipeShareRepository extends JpaRepository<RecipeShare, UUID> {
    List<RecipeShare> findByRecipeId(UUID recipeId);
    List<RecipeShare> findByHouseholdId(UUID householdId);
    void deleteByRecipeId(UUID recipeId);
}
