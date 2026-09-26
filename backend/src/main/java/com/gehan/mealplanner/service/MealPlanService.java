package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.CupboardItem;
import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.domain.MealPlanEntry;
import com.gehan.mealplanner.domain.Place;
import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.dto.MealPlanDtos.MealPlanEntryResponse;
import com.gehan.mealplanner.dto.MealPlanDtos.AddMealPlanEntryRequest;
import com.gehan.mealplanner.dto.MealPlanDtos.UpdateMealPlanEntryRequest;
import com.gehan.mealplanner.repository.CupboardItemRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.MealPlanEntryRepository;
import com.gehan.mealplanner.repository.PlaceRepository;
import com.gehan.mealplanner.repository.RecipeRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class MealPlanService {

    private final MealPlanEntryRepository mealPlanEntryRepository;
    private final HouseholdRepository householdRepository;
    private final RecipeRepository recipeRepository;
    private final PlaceRepository placeRepository;
    private final CupboardItemRepository cupboardRepository;
    private final HouseholdService householdService;
    private final IngredientService ingredientService;

    public MealPlanService(MealPlanEntryRepository mealPlanEntryRepository,
                            HouseholdRepository householdRepository,
                            RecipeRepository recipeRepository,
                            PlaceRepository placeRepository,
                            CupboardItemRepository cupboardRepository,
                            HouseholdService householdService,
                            IngredientService ingredientService) {
        this.mealPlanEntryRepository = mealPlanEntryRepository;
        this.householdRepository = householdRepository;
        this.recipeRepository = recipeRepository;
        this.placeRepository = placeRepository;
        this.cupboardRepository = cupboardRepository;
        this.householdService = householdService;
        this.ingredientService = ingredientService;
    }

    @Transactional(readOnly = true)
    public List<MealPlanEntryResponse> listRange(UUID householdId, UUID requesterId, LocalDate start, LocalDate end) {
        householdService.assertMember(householdId, requesterId);
        Map<UUID, CupboardItem> cupboard = cupboard(householdId);
        return mealPlanEntryRepository
                .findByHouseholdIdAndDateBetweenOrderByDateAscMealTypeAsc(householdId, start, end)
                .stream().sorted(MealPlanEntry.EATING_ORDER).map(e -> toResponse(e, cupboard)).toList();
    }

    /** Adds a dish to a slot. Call it again to put sides alongside a main. */
    @Transactional
    public MealPlanEntryResponse add(UUID householdId, UUID requesterId, AddMealPlanEntryRequest request) {
        householdService.assertMember(householdId, requesterId);
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));

        // Exactly one: a dish you cook, a place you go, or a single thing to eat.
        String itemName = blankToNull(request.itemName());
        int kinds = (request.recipeId() != null ? 1 : 0) + (request.placeId() != null ? 1 : 0) + (itemName != null ? 1 : 0);
        if (kinds != 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Send one of a recipe, a place or an item.");
        }
        Ingredient item = itemName == null ? null : ingredientService.findOrCreate(itemName, null);

        boolean alreadyThere = mealPlanEntryRepository
                .findByHouseholdIdAndDateAndMealTypeOrderByCreatedAtAsc(householdId, request.date(), request.mealType())
                .stream()
                .anyMatch(e -> request.recipeId() != null
                        ? e.getRecipe() != null && e.getRecipe().getId().equals(request.recipeId())
                        : request.placeId() != null
                                ? e.getPlace() != null && e.getPlace().getId().equals(request.placeId())
                                : e.getItem() != null && e.getItem().getId().equals(item.getId()));
        if (alreadyThere) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That's already on this meal.");
        }

        MealPlanEntry entry = MealPlanEntry.builder()
                .household(household)
                .date(request.date())
                .mealType(request.mealType())
                .recipe(request.recipeId() == null ? null : requireRecipe(request.recipeId()))
                .place(request.placeId() == null ? null : requirePlace(request.placeId(), householdId))
                .item(item)
                .time(request.time())
                // Servings describe cooking. A table booking or a bowl of strawberries does not have them.
                .servings(request.recipeId() == null ? null
                        : request.servings() != null ? request.servings() : household.getDefaultServings())
                .notes(request.notes())
                // A mutable set, not Set.of()/copyOf() — Hibernate mutates this collection in
                // place (clear-then-refill) on every merge, which throws on an immutable one.
                .includedOptionalIngredientIds(request.includedOptionalIngredientIds() == null
                        ? new HashSet<>() : new HashSet<>(request.includedOptionalIngredientIds()))
                .build();

        return toResponse(mealPlanEntryRepository.save(entry), cupboard(householdId));
    }

    /** Changes one dish in place — swap what it is, or just adjust how many it serves. */
    @Transactional
    public MealPlanEntryResponse update(UUID entryId, UUID requesterId, UpdateMealPlanEntryRequest request) {
        MealPlanEntry entry = mealPlanEntryRepository.findById(entryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Meal plan entry not found"));
        UUID householdId = entry.getHousehold().getId();
        householdService.assertMember(householdId, requesterId);

        // Swapping one kind for another clears the others, so an entry is only ever one thing.
        // A deleted recipe's name is one of those things: once the slot holds something else,
        // "was deleted" is no longer about it.
        String itemName = blankToNull(request.itemName());
        if (request.recipeId() != null || request.placeId() != null || itemName != null) {
            entry.setDeletedRecipeName(null);
        }
        if (request.recipeId() != null) {
            entry.setRecipe(requireRecipe(request.recipeId()));
            entry.setPlace(null);
            entry.setItem(null);
        }
        if (request.placeId() != null) {
            entry.setPlace(requirePlace(request.placeId(), householdId));
            entry.setRecipe(null);
            entry.setItem(null);
        }
        if (itemName != null) {
            entry.setItem(ingredientService.findOrCreate(itemName, null));
            entry.setRecipe(null);
            entry.setPlace(null);
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
        if (request.includedOptionalIngredientIds() != null) {
            entry.setIncludedOptionalIngredientIds(new HashSet<>(request.includedOptionalIngredientIds()));
        }
        return toResponse(mealPlanEntryRepository.save(entry), cupboard(householdId));
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

    private Map<UUID, CupboardItem> cupboard(UUID householdId) {
        Map<UUID, CupboardItem> cupboard = new HashMap<>();
        cupboardRepository.findByHouseholdId(householdId).forEach(c -> cupboard.put(c.getIngredient().getId(), c));
        return cupboard;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private MealPlanEntryResponse toResponse(MealPlanEntry entry, Map<UUID, CupboardItem> cupboard) {
        Recipe recipe = entry.getRecipe();
        Ingredient item = entry.getItem();
        CupboardItem stocked = item == null ? null : cupboard.get(item.getId());
        return new MealPlanEntryResponse(
                entry.getId(),
                entry.getDate(),
                entry.getMealType(),
                recipe != null ? recipe.getId() : null,
                recipe != null ? recipe.getName() : entry.getDeletedRecipeName(),
                recipe != null && recipe.getIngredients().isEmpty(),
                entry.getPlace() != null ? entry.getPlace().getId() : null,
                entry.getPlace() != null ? entry.getPlace().getName() : null,
                item != null ? item.getName() : null,
                stocked != null && !stocked.isUsedUp(),
                stocked != null && stocked.isShort(),
                entry.getTime(),
                entry.getServings(),
                entry.getNotes(),
                List.copyOf(entry.getIncludedOptionalIngredientIds()),
                recipe == null && entry.getDeletedRecipeName() != null);
    }
}
