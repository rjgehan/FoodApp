package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.RecipeLink;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface RecipeLinkRepository extends JpaRepository<RecipeLink, UUID> {

    Optional<RecipeLink> findByToken(String token);

    Optional<RecipeLink> findByRecipeId(UUID recipeId);

    void deleteByRecipeId(UUID recipeId);
}
