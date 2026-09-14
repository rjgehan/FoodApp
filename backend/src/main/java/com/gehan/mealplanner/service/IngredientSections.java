package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.GroceryCategory;
import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.domain.IngredientSection;
import com.gehan.mealplanner.repository.GroceryCategoryRepository;
import com.gehan.mealplanner.repository.IngredientSectionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Which of this household's own categories an ingredient is in: its own placement if it made one
 * (by hand, or by Sort), otherwise a free guess from {@link Ingredient#getSection()} translated
 * through whichever of the household's categories still {@code seededFrom} that same bucket,
 * otherwise null — unsorted, waiting on Sort or a manual move. The grocery list and the cupboard
 * both group by this, so they always agree.
 */
@Service
public class IngredientSections {

    private final IngredientSectionRepository repository;
    private final GroceryCategoryRepository categoryRepository;

    public IngredientSections(IngredientSectionRepository repository, GroceryCategoryRepository categoryRepository) {
        this.repository = repository;
        this.categoryRepository = categoryRepository;
    }

    /** One query for a whole list, rather than one per item. */
    @Transactional(readOnly = true)
    public Map<UUID, GroceryCategory> overrides(UUID householdId) {
        Map<UUID, GroceryCategory> overrides = new HashMap<>();
        repository.findByHouseholdId(householdId)
                .forEach(s -> overrides.put(s.getIngredient().getId(), s.getCategory()));
        return overrides;
    }

    /** This household's categories, for resolving the keyword/Gemini guess via {@code seededFrom}. */
    @Transactional(readOnly = true)
    public List<GroceryCategory> categories(UUID householdId) {
        return categoryRepository.findByHouseholdIdOrderByPosition(householdId);
    }

    /** Null means unsorted — nothing has placed this ingredient for this household yet. */
    public static GroceryCategory resolve(Ingredient ingredient, Map<UUID, GroceryCategory> overrides,
                                           List<GroceryCategory> categories) {
        GroceryCategory own = overrides.get(ingredient.getId());
        if (own != null) {
            return own;
        }
        if (ingredient.getSection() == null) {
            return null;
        }
        return categories.stream()
                .filter(c -> c.getSeededFrom() == ingredient.getSection())
                .findFirst()
                .orElse(null);
    }

    /** Placed by someone or something for this household, one way or another. */
    public static boolean isSorted(Ingredient ingredient, Map<UUID, GroceryCategory> overrides,
                                    List<GroceryCategory> categories) {
        return resolve(ingredient, overrides, categories) != null;
    }

    @Transactional
    public void move(Household household, Ingredient ingredient, GroceryCategory category) {
        IngredientSection row = repository.findByHouseholdIdAndIngredientId(household.getId(), ingredient.getId())
                .orElseGet(() -> IngredientSection.builder().household(household).ingredient(ingredient).build());
        row.setCategory(category);
        repository.save(row);
    }
}
