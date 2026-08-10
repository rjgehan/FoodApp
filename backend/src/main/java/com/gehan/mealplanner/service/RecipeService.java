package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.domain.RecipeIngredient;
import com.gehan.mealplanner.domain.RecipeVisibility;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientResponse;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateRecipeVisibilityRequest;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.RecipeRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
public class RecipeService {

    private final RecipeRepository recipeRepository;
    private final HouseholdRepository householdRepository;
    private final HouseholdService householdService;
    private final IngredientService ingredientService;

    public RecipeService(RecipeRepository recipeRepository,
                          HouseholdRepository householdRepository,
                          HouseholdService householdService,
                          IngredientService ingredientService) {
        this.recipeRepository = recipeRepository;
        this.householdRepository = householdRepository;
        this.householdService = householdService;
        this.ingredientService = ingredientService;
    }

    @Transactional
    public RecipeResponse create(UUID householdId, UUID requesterId, RecipeRequest request) {
        householdService.assertMember(householdId, requesterId);
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));

        Recipe recipe = Recipe.builder()
                .household(household)
                .name(request.name())
                .description(request.description())
                .instructions(request.instructions())
                .prepTimeMinutes(request.prepTimeMinutes())
                .cookTimeMinutes(request.cookTimeMinutes())
                .servings(request.servings())
                .sourceUrl(request.sourceUrl())
                .visibility(household.getDefaultRecipeVisibility())
                .build();

        request.ingredients().forEach(i -> recipe.getIngredients().add(
                RecipeIngredient.builder()
                        .recipe(recipe)
                        .ingredient(ingredientService.findOrCreate(i.ingredientName(), i.unit()))
                        .quantity(i.quantity())
                        .unit(i.unit())
                        .notes(i.notes())
                        .build()));

        return toResponse(recipeRepository.save(recipe));
    }

    /** A household's own recipes plus every recipe any household has published globally. */
    @Transactional(readOnly = true)
    public List<RecipeResponse> list(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return recipeRepository.findByHouseholdIdOrVisibility(householdId, RecipeVisibility.GLOBAL).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public RecipeResponse get(UUID recipeId, UUID requesterId) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        if (recipe.getVisibility() != RecipeVisibility.GLOBAL) {
            householdService.assertMember(recipe.getHousehold().getId(), requesterId);
        }
        return toResponse(recipe);
    }

    /** Only the owning household can publish/unpublish its own recipe. */
    @Transactional
    public RecipeResponse updateVisibility(UUID recipeId, UUID requesterId, UpdateRecipeVisibilityRequest request) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        householdService.assertMember(recipe.getHousehold().getId(), requesterId);
        recipe.setVisibility(request.visibility());
        return toResponse(recipeRepository.save(recipe));
    }

    @Transactional
    public void delete(UUID recipeId, UUID requesterId) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        householdService.assertMember(recipe.getHousehold().getId(), requesterId);
        recipeRepository.delete(recipe);
    }

    private RecipeResponse toResponse(Recipe recipe) {
        List<RecipeIngredientResponse> ingredients = recipe.getIngredients().stream()
                .map(i -> new RecipeIngredientResponse(
                        i.getId(), i.getIngredient().getName(), i.getQuantity(), i.getUnit(), i.getNotes()))
                .toList();

        return new RecipeResponse(
                recipe.getId(), recipe.getHousehold().getId(), recipe.getName(), recipe.getDescription(),
                recipe.getInstructions(), recipe.getPrepTimeMinutes(), recipe.getCookTimeMinutes(),
                recipe.getServings(), recipe.getSourceUrl(), recipe.getVisibility(), ingredients);
    }
}
