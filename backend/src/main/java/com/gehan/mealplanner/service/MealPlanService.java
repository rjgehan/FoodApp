package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.MealPlanEntry;
import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.dto.MealPlanDtos.MealPlanEntryResponse;
import com.gehan.mealplanner.dto.MealPlanDtos.UpsertMealPlanEntryRequest;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.MealPlanEntryRepository;
import com.gehan.mealplanner.repository.RecipeRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
public class MealPlanService {

    private final MealPlanEntryRepository mealPlanEntryRepository;
    private final HouseholdRepository householdRepository;
    private final RecipeRepository recipeRepository;
    private final HouseholdService householdService;

    public MealPlanService(MealPlanEntryRepository mealPlanEntryRepository,
                            HouseholdRepository householdRepository,
                            RecipeRepository recipeRepository,
                            HouseholdService householdService) {
        this.mealPlanEntryRepository = mealPlanEntryRepository;
        this.householdRepository = householdRepository;
        this.recipeRepository = recipeRepository;
        this.householdService = householdService;
    }

    @Transactional(readOnly = true)
    public List<MealPlanEntryResponse> listRange(UUID householdId, UUID requesterId, LocalDate start, LocalDate end) {
        householdService.assertMember(householdId, requesterId);
        return mealPlanEntryRepository
                .findByHouseholdIdAndDateBetweenOrderByDateAscMealTypeAsc(householdId, start, end)
                .stream().map(this::toResponse).toList();
    }

    /** Creates the meal plan entry for a date+mealType slot if none exists, otherwise substitutes it. */
    @Transactional
    public MealPlanEntryResponse upsert(UUID householdId, UUID requesterId, UpsertMealPlanEntryRequest request) {
        householdService.assertMember(householdId, requesterId);
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));

        MealPlanEntry entry = mealPlanEntryRepository
                .findByHouseholdIdAndDateAndMealType(householdId, request.date(), request.mealType())
                .orElseGet(() -> MealPlanEntry.builder()
                        .household(household)
                        .date(request.date())
                        .mealType(request.mealType())
                        .build());

        Recipe recipe = null;
        if (request.recipeId() != null) {
            recipe = recipeRepository.findById(request.recipeId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        }

        entry.setRecipe(recipe);
        entry.setServings(request.servings() != null ? request.servings() : household.getDefaultServings());
        entry.setNotes(request.notes());

        return toResponse(mealPlanEntryRepository.save(entry));
    }

    @Transactional
    public void delete(UUID entryId, UUID requesterId) {
        MealPlanEntry entry = mealPlanEntryRepository.findById(entryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Meal plan entry not found"));
        householdService.assertMember(entry.getHousehold().getId(), requesterId);
        mealPlanEntryRepository.delete(entry);
    }

    private MealPlanEntryResponse toResponse(MealPlanEntry entry) {
        return new MealPlanEntryResponse(
                entry.getId(),
                entry.getDate(),
                entry.getMealType(),
                entry.getRecipe() != null ? entry.getRecipe().getId() : null,
                entry.getRecipe() != null ? entry.getRecipe().getName() : null,
                entry.getServings(),
                entry.getNotes());
    }
}
