package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.RecipeCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RecipeCategoryRepository extends JpaRepository<RecipeCategory, UUID> {
    List<RecipeCategory> findByHouseholdIdOrderByNameAsc(UUID householdId);
    Optional<RecipeCategory> findByHouseholdIdAndNameIgnoreCase(UUID householdId, String name);
}
