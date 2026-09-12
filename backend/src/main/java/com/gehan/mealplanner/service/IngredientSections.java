package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.domain.IngredientSection;
import com.gehan.mealplanner.domain.StoreSection;
import com.gehan.mealplanner.repository.IngredientSectionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Which aisle an ingredient is in for one household: that household's own correction if it made
 * one, otherwise the shared guess on the ingredient, otherwise Other. The grocery list and the
 * cupboard both group by this, so they always agree.
 */
@Service
public class IngredientSections {

    private final IngredientSectionRepository repository;

    public IngredientSections(IngredientSectionRepository repository) {
        this.repository = repository;
    }

    /** One query for a whole list, rather than one per item. */
    @Transactional(readOnly = true)
    public Map<UUID, StoreSection> overrides(UUID householdId) {
        Map<UUID, StoreSection> overrides = new HashMap<>();
        repository.findByHouseholdId(householdId)
                .forEach(s -> overrides.put(s.getIngredient().getId(), s.getSection()));
        return overrides;
    }

    public static StoreSection resolve(Ingredient ingredient, Map<UUID, StoreSection> overrides) {
        StoreSection own = overrides.get(ingredient.getId());
        if (own != null) {
            return own;
        }
        return ingredient.getSection() != null ? ingredient.getSection() : StoreSection.OTHER;
    }

    /** Placed by someone or something — so Sort has nothing to do for it. */
    public static boolean isSorted(Ingredient ingredient, Map<UUID, StoreSection> overrides) {
        return overrides.containsKey(ingredient.getId()) || ingredient.getSection() != null;
    }

    @Transactional
    public void move(Household household, Ingredient ingredient, StoreSection section) {
        IngredientSection row = repository.findByHouseholdIdAndIngredientId(household.getId(), ingredient.getId())
                .orElseGet(() -> IngredientSection.builder().household(household).ingredient(ingredient).build());
        row.setSection(section);
        repository.save(row);
    }
}
