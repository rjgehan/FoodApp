package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.RecipeCategory;
import com.gehan.mealplanner.domain.RecipeSection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RecipeCategoryRepository extends JpaRepository<RecipeCategory, UUID> {
    List<RecipeCategory> findByHouseholdIdOrderByNameAsc(UUID householdId);

    /** The tag of that name in one drawer. Names are unique per drawer, ignoring case. */
    Optional<RecipeCategory> findByHouseholdIdAndSectionAndNameIgnoreCase(UUID householdId, RecipeSection section, String name);
}
