package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.MealPlanEntry;
import com.gehan.mealplanner.domain.Place;
import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.dto.MealPlanDtos.MealPlanEntryResponse;
import com.gehan.mealplanner.dto.MealPlanDtos.AddMealPlanEntryRequest;
import com.gehan.mealplanner.dto.MealPlanDtos.UpdateMealPlanEntryRequest;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.MealPlanEntryRepository;
import com.gehan.mealplanner.repository.PlaceRepository;
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
    private final PlaceRepository placeRepository;
    private final HouseholdService householdService;

    public MealPlanService(MealPlanEntryRepository mealPlanEntryRepository,
                            HouseholdRepository householdRepository,
                            RecipeRepository recipeRepository,
                            PlaceRepository placeRepository,
                            HouseholdService householdService) {
        this.mealPlanEntryRepository = mealPlanEntryRepository;
        this.householdRepository = householdRepository;
        this.recipeRepository = recipeRepository;
        this.placeRepository = placeRepository;
        this.householdService = householdService;
    }

    @Transactional(readOnly = true)
    public List<MealPlanEntryResponse> listRange(UUID householdId, UUID requesterId, LocalDate start, LocalDate end) {
        householdService.assertMember(householdId, requesterId);
        return mealPlanEntryRepository
                .findByHouseholdIdAndDateBetweenOrderByDateAscMealTypeAsc(householdId, start, end)
                .stream().map(this::toResponse).toList();
    }

    /** Adds a dish to a slot. Call it again to put sides alongside a main. */
    @Transactional
    public MealPlanEntryResponse add(UUID householdId, UUID requesterId, AddMealPlanEntryRequest request) {
        householdService.assertMember(householdId, requesterId);
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));

        // Exactly one of the two: a slot holds a dish you cook or a place you go, not both.
        if ((request.recipeId() == null) == (request.placeId() == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Send either a recipe or a place.");
        }

        boolean alreadyThere = mealPlanEntryRepository
                .findByHouseholdIdAndDateAndMealTypeOrderByCreatedAtAsc(householdId, request.date(), request.mealType())
                .stream()
                .anyMatch(e -> request.recipeId() != null
                        ? e.getRecipe() != null && e.getRecipe().getId().equals(request.recipeId())
                        : e.getPlace() != null && e.getPlace().getId().equals(request.placeId()));
        if (alreadyThere) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That's already on this meal.");
        }

        MealPlanEntry entry = MealPlanEntry.builder()
                .household(household)
                .date(request.date())
                .mealType(request.mealType())
                .recipe(request.recipeId() == null ? null : requireRecipe(request.recipeId()))
                .place(request.placeId() == null ? null : requirePlace(request.placeId(), householdId))
                // Servings describe cooking. A table booking does not have them.
                .time(request.time())
                .servings(request.placeId() != null ? null
                        : request.servings() != null ? request.servings() : household.getDefaultServings())
                .notes(request.notes())
                .build();

        return toResponse(mealPlanEntryRepository.save(entry));
    }

    /** Changes one dish in place — swap the recipe, or just adjust how many it serves. */
    @Transactional
    public MealPlanEntryResponse update(UUID entryId, UUID requesterId, UpdateMealPlanEntryRequest request) {
        MealPlanEntry entry = mealPlanEntryRepository.findById(entryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Meal plan entry not found"));
        householdService.assertMember(entry.getHousehold().getId(), requesterId);

        // Swapping one kind for the other clears the other side, so an entry is never both.
        if (request.recipeId() != null) {
            entry.setRecipe(requireRecipe(request.recipeId()));
            entry.setPlace(null);
        }
        if (request.placeId() != null) {
            entry.setPlace(requirePlace(request.placeId(), entry.getHousehold().getId()));
            entry.setRecipe(null);
        }
        if (Boolean.TRUE.equals(request.clearTime())) {
            entry.setTime(null);
        } else if (request.time() != null) {
            entry.setTime(request.time());
        }
        if (request.servings() != null) {
            entry.setServings(request.servings());
        }
        if (request.notes() != null) {
            entry.setNotes(request.notes());
        }
        return toResponse(mealPlanEntryRepository.save(entry));
    }

    private Recipe requireRecipe(UUID recipeId) {
        return recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
    }

    /** Places are not shared between households, so one can only be planned by its own. */
    private Place requirePlace(UUID placeId, UUID householdId) {
        Place place = placeRepository.findById(placeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Place not found"));
        if (!place.getHousehold().getId().equals(householdId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "That place belongs to another household");
        }
        return place;
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
                entry.getPlace() != null ? entry.getPlace().getId() : null,
                entry.getPlace() != null ? entry.getPlace().getName() : null,
                entry.getTime(),
                entry.getServings(),
                entry.getNotes());
    }
}
