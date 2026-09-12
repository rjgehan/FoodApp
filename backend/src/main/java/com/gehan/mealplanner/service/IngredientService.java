package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.domain.StoreSection;
import com.gehan.mealplanner.repository.IngredientRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
public class IngredientService {

    private final IngredientRepository ingredientRepository;

    public IngredientService(IngredientRepository ingredientRepository) {
        this.ingredientRepository = ingredientRepository;
    }

    /**
     * Finds the canonical {@link Ingredient} for a name, creating one if this is the first time it's
     * used. A new one is placed in an aisle straight away when the keyword list knows it.
     */
    public Ingredient findOrCreate(String name, String defaultUnit) {
        String normalized = normalize(name);
        return ingredientRepository.findByNormalizedName(normalized)
                .orElseGet(() -> ingredientRepository.save(Ingredient.builder()
                        .name(name.trim())
                        .normalizedName(normalized)
                        .defaultUnit(defaultUnit)
                        .section(StoreSectionKeywords.guess(name).orElse(null))
                        .build()));
    }

    /**
     * Places ingredients made before aisles existed — keyword list only, so it is free to run on
     * every start. Whatever it cannot place waits for someone to press Sort.
     */
    @Transactional
    public int placeUnsortedByKeyword() {
        int placed = 0;
        for (Ingredient ingredient : ingredientRepository.findBySectionIsNull()) {
            Optional<StoreSection> guess = StoreSectionKeywords.guess(ingredient.getName());
            if (guess.isPresent()) {
                ingredient.setSection(guess.get());
                placed++;
            }
        }
        return placed;
    }

    private String normalize(String name) {
        return name.trim().toLowerCase();
    }
}
