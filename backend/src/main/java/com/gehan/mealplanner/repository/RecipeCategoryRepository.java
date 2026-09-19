package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.RecipeCategory;
import com.gehan.mealplanner.domain.RecipeSection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RecipeCategoryRepository extends JpaRepository<RecipeCategory, UUID> {
    List<RecipeCategory> findByHouseholdIdOrderByNameAsc(UUID householdId);
    Optional<RecipeCategory> findByHouseholdIdAndNameIgnoreCase(UUID householdId, String name);

    /** A group in one drawer, or the drawer-less kind that shows in all of them. */
    Optional<RecipeCategory> findByHouseholdIdAndSectionAndNameIgnoreCase(UUID householdId, RecipeSection section, String name);

    Optional<RecipeCategory> findByHouseholdIdAndSectionIsNullAndNameIgnoreCase(UUID householdId, String name);
}
