package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.domain.RecipeFiling;
import com.gehan.mealplanner.domain.RecipeIngredient;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.repository.RecipeFilingRepository;
import com.gehan.mealplanner.repository.RecipeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The recipes a generated plan may choose from — only ones that already exist, never invented:
 * everything the household can see in its own catalog (its recipes, ones shared with it, ones it
 * filed from Explore), which are "Yours", and optionally what other households have published.
 *
 * Each comes with the drawer it is filed in, which is what says whether it suits breakfast or
 * dinner: the household's own filing, else the drawer its owner keeps it in.
 */
@Service
public class RecipePool {

    /**
     * Published recipes looked at, newest first. Enough for variety; bounded so a busy server
     * does not make a plan walk every recipe anyone ever published.
     */
    static final int PUBLISHED_LIMIT = 300;

    public record PoolRecipe(Recipe recipe, RecipeSection section, boolean yours) {
        public UUID id() {
            return recipe.getId();
        }

        public String name() {
            return recipe.getName();
        }

        public UUID coverImageId() {
            return recipe.getCoverImage() == null ? null : recipe.getCoverImage().getId();
        }

        public Integer minutes() {
            Integer prep = recipe.getPrepTimeMinutes(), cook = recipe.getCookTimeMinutes();
            if (prep == null && cook == null) return null;
            return (prep == null ? 0 : prep) + (cook == null ? 0 : cook);
        }

        /** The lines a cook has to have: optional ones, and water and salt, are left out. */
        public List<CupboardPlanner.Need> needs() {
            List<CupboardPlanner.Need> needs = new ArrayList<>();
            for (RecipeIngredient line : recipe.getIngredients()) {
                if (line.isOptional()) continue;
                String name = line.getIngredient().getName();
                if (IngredientKeys.isFree(name)) continue;
                needs.add(new CupboardPlanner.Need(line.getIngredient().getId(), name, IngredientKeys.key(name)));
            }
            return needs;
        }

        public CupboardPlanner.Dish dish() {
            return new CupboardPlanner.Dish(id(), name(), section, yours, needs());
        }

        /** The name and every ingredient, lower-cased — what preferences ("no pork") are checked against. */
        public String words() {
            StringBuilder words = new StringBuilder(recipe.getName().toLowerCase());
            for (RecipeIngredient line : recipe.getIngredients()) {
                if (line.isOptional()) continue;
                words.append(" | ").append(line.getIngredient().getName().toLowerCase());
            }
            return words.toString();
        }
    }

    private final RecipeRepository recipes;
    private final RecipeFilingRepository filings;

    public RecipePool(RecipeRepository recipes, RecipeFilingRepository filings) {
        this.recipes = recipes;
        this.filings = filings;
    }

    /**
     * Particular recipes, for reading back a saved plan: each one the household may still use —
     * one of its own (or shared with or filed by it), or still published — and none that has since
     * been deleted or taken out of Explore without being kept.
     */
    @Transactional(readOnly = true)
    public Map<UUID, PoolRecipe> forIds(UUID householdId, java.util.Collection<UUID> ids) {
        Set<UUID> yours = new HashSet<>();
        for (Recipe r : recipes.findVisibleTo(householdId)) yours.add(r.getId());
        Map<UUID, Recipe> found = new HashMap<>();
        for (Recipe r : recipes.findAllById(ids)) {
            if (yours.contains(r.getId()) || r.isPublished()) found.put(r.getId(), r);
        }
        Map<UUID, RecipeSection> sections = sections(householdId, found);
        Map<UUID, PoolRecipe> result = new HashMap<>();
        found.forEach((id, r) -> result.put(id, new PoolRecipe(r, sections.get(id), yours.contains(id))));
        return result;
    }

    /** The household's own drawer for each recipe, else the drawer its owner keeps it in. */
    private Map<UUID, RecipeSection> sections(UUID householdId, Map<UUID, Recipe> chosen) {
        Map<UUID, RecipeSection> ownFiling = new HashMap<>();
        Map<UUID, RecipeSection> ownerFiling = new HashMap<>();
        if (chosen.isEmpty()) return ownFiling;
        for (RecipeFiling f : filings.findByRecipeIdIn(chosen.keySet())) {
            UUID recipeId = f.getRecipe().getId();
            if (f.getHousehold().getId().equals(householdId)) {
                ownFiling.put(recipeId, f.getSection());
            } else if (f.getHousehold().getId().equals(chosen.get(recipeId).getHousehold().getId())) {
                ownerFiling.put(recipeId, f.getSection());
            }
        }
        ownerFiling.putAll(ownFiling);
        return ownerFiling;
    }

    /** Recipes with no ingredients are left out: there is nothing to plan or count with them. */
    @Transactional(readOnly = true)
    public List<PoolRecipe> forHousehold(UUID householdId, boolean includePublished) {
        Map<UUID, Recipe> chosen = new HashMap<>();
        Set<UUID> yours = new HashSet<>();
        Set<Recipe> ordered = new LinkedHashSet<>();
        for (Recipe r : recipes.findVisibleTo(householdId)) {
            if (chosen.putIfAbsent(r.getId(), r) == null) {
                yours.add(r.getId());
                ordered.add(r);
            }
        }
        if (includePublished) {
            int taken = 0;
            for (Recipe r : recipes.findByPublishedTrueOrderByPublishedAtDesc()) {
                if (taken >= PUBLISHED_LIMIT) break;
                if (chosen.putIfAbsent(r.getId(), r) == null) {
                    ordered.add(r);
                    taken++;
                }
            }
        }

        Map<UUID, RecipeSection> sections = sections(householdId, chosen);

        List<PoolRecipe> pool = new ArrayList<>();
        for (Recipe r : ordered) {
            if (r.getIngredients().isEmpty()) continue;
            pool.add(new PoolRecipe(r, sections.get(r.getId()), yours.contains(r.getId())));
        }
        return pool;
    }
}
