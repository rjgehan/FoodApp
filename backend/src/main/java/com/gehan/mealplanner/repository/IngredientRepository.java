package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.Ingredient;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface IngredientRepository extends JpaRepository<Ingredient, UUID> {
    Optional<Ingredient> findByNormalizedName(String normalizedName);

    List<Ingredient> findBySectionIsNull();
}
