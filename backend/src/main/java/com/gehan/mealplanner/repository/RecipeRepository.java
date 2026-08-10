package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.domain.RecipeVisibility;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RecipeRepository extends JpaRepository<Recipe, UUID> {
    List<Recipe> findByHouseholdId(UUID householdId);

    /** A household's own recipes plus every recipe any household has published globally. */
    List<Recipe> findByHouseholdIdOrVisibility(UUID householdId, RecipeVisibility visibility);
}
