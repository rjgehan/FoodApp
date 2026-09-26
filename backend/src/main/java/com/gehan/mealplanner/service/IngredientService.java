package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.domain.StoreSection;
import com.gehan.mealplanner.repository.IngredientRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
public class IngredientService {

    private final IngredientRepository ingredientRepository;
    private final JdbcTemplate jdbc;

    public IngredientService(IngredientRepository ingredientRepository, JdbcTemplate jdbc) {
        this.ingredientRepository = ingredientRepository;
        this.jdbc = jdbc;
    }

    /**
     * Finds the canonical {@link Ingredient} for a name, creating one if this is the first time it's
     * used. A new one is placed in an aisle straight away when the keyword list knows it.
     *
     * Two requests can both find nothing and both try to make it — a double tap, or two phones
     * adding the same new thing. A plain save would have the loser break the unique name and fail
     * its whole request, and a failed insert spoils the transaction it is in, so there is no
     * catching it and reading again. ON CONFLICT DO NOTHING instead waits for the other insert to
     * commit and then quietly makes nothing, so the read after it finds the one row either way.
     */
    public Ingredient findOrCreate(String name, String defaultUnit) {
        String normalized = normalize(name);
        Optional<Ingredient> known = ingredientRepository.findByNormalizedName(normalized);
        if (known.isPresent()) {
            return known.get();
        }
        jdbc.update("""
                INSERT INTO ingredients (id, name, normalized_name, default_unit, section)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT DO NOTHING
                """,
                UUID.randomUUID(), name.trim(), normalized, defaultUnit,
                StoreSectionKeywords.guess(name).map(Enum::name).orElse(null));
        return ingredientRepository.findByNormalizedName(normalized)
                .orElseThrow(() -> new IllegalStateException("Ingredient vanished as it was made: " + normalized));
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

    /**
     * Baking and Spices used to be part of Dry goods. Anything sitting in Dry goods that the
     * keyword list would now put in one of them moves across; anything it would still call Dry
     * goods stays put. A household's own corrections are separate rows and are not touched.
     */
    @Transactional
    public int moveIntoBakingAndSpices() {
        int moved = 0;
        for (Ingredient ingredient : ingredientRepository.findBySection(StoreSection.DRY_GOODS)) {
            Optional<StoreSection> guess = StoreSectionKeywords.guess(ingredient.getName());
            if (guess.isPresent() && (guess.get() == StoreSection.BAKING || guess.get() == StoreSection.SPICES)) {
                ingredient.setSection(guess.get());
                moved++;
            }
        }
        return moved;
    }

    private String normalize(String name) {
        return name.trim().toLowerCase();
    }
}
