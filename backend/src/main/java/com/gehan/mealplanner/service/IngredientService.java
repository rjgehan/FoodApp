package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.repository.IngredientRepository;
import org.springframework.stereotype.Service;

@Service
public class IngredientService {

    private final IngredientRepository ingredientRepository;

    public IngredientService(IngredientRepository ingredientRepository) {
        this.ingredientRepository = ingredientRepository;
    }

    /** Finds the canonical {@link Ingredient} for a name, creating one if this is the first time it's used. */
    public Ingredient findOrCreate(String name, String defaultUnit) {
        String normalized = normalize(name);
        return ingredientRepository.findByNormalizedName(normalized)
                .orElseGet(() -> ingredientRepository.save(Ingredient.builder()
                        .name(name.trim())
                        .normalizedName(normalized)
                        .defaultUnit(defaultUnit)
                        .build()));
    }

    private String normalize(String name) {
        return name.trim().toLowerCase();
    }
}
