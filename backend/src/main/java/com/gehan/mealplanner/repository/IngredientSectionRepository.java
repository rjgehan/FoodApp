package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.IngredientSection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface IngredientSectionRepository extends JpaRepository<IngredientSection, UUID> {
    List<IngredientSection> findByHouseholdId(UUID householdId);

    Optional<IngredientSection> findByHouseholdIdAndIngredientId(UUID householdId, UUID ingredientId);

    List<IngredientSection> findByCategoryId(UUID categoryId);
}
