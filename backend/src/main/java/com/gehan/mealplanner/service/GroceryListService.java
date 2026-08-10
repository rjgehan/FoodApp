package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.*;
import com.gehan.mealplanner.dto.BlacklistDtos.AddBlacklistRequest;
import com.gehan.mealplanner.dto.BlacklistDtos.BlacklistEntryResponse;
import com.gehan.mealplanner.dto.GroceryListDtos.AddItemRequest;
import com.gehan.mealplanner.dto.GroceryListDtos.GroceryListItemResponse;
import com.gehan.mealplanner.realtime.GroceryListEventPublisher;
import com.gehan.mealplanner.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class GroceryListService {

    private final GroceryListItemRepository groceryListItemRepository;
    private final MealPlanEntryRepository mealPlanEntryRepository;
    private final HouseholdRepository householdRepository;
    private final UserRepository userRepository;
    private final HouseholdService householdService;
    private final IngredientService ingredientService;
    private final BlacklistedIngredientRepository blacklistedIngredientRepository;
    private final GroceryListEventPublisher eventPublisher;

    public GroceryListService(GroceryListItemRepository groceryListItemRepository,
                               MealPlanEntryRepository mealPlanEntryRepository,
                               HouseholdRepository householdRepository,
                               UserRepository userRepository,
                               HouseholdService householdService,
                               IngredientService ingredientService,
                               BlacklistedIngredientRepository blacklistedIngredientRepository,
                               GroceryListEventPublisher eventPublisher) {
        this.groceryListItemRepository = groceryListItemRepository;
        this.mealPlanEntryRepository = mealPlanEntryRepository;
        this.householdRepository = householdRepository;
        this.userRepository = userRepository;
        this.householdService = householdService;
        this.ingredientService = ingredientService;
        this.blacklistedIngredientRepository = blacklistedIngredientRepository;
        this.eventPublisher = eventPublisher;
    }

    @Transactional(readOnly = true)
    public List<GroceryListItemResponse> listItems(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return groceryListItemRepository.findByHouseholdId(householdId).stream()
                .map(this::toItemResponse)
                .toList();
    }

    @Transactional
    public GroceryListItemResponse addManualItem(UUID householdId, UUID requesterId, AddItemRequest request) {
        Household household = requireMember(householdId, requesterId);

        GroceryListItem item = GroceryListItem.builder()
                .household(household)
                .ingredient(request.ingredientName() != null
                        ? ingredientService.findOrCreate(request.ingredientName(), request.unit())
                        : null)
                .customName(request.ingredientName())
                .quantity(request.quantity())
                .unit(request.unit())
                .build();

        item = groceryListItemRepository.save(item);
        GroceryListItemResponse response = toItemResponse(item);
        eventPublisher.itemChanged(householdId, response);
        return response;
    }

    /** Toggles an item's checked state and broadcasts the change to everyone watching this list in real time. */
    @Transactional
    public GroceryListItemResponse setChecked(UUID householdId, UUID itemId, UUID requesterId, boolean checked) {
        householdService.assertMember(householdId, requesterId);
        GroceryListItem item = findItem(householdId, itemId);

        item.setChecked(checked);
        if (checked) {
            User user = userRepository.findById(requesterId).orElse(null);
            item.setCheckedBy(user);
            item.setCheckedAt(Instant.now());
        } else {
            item.setCheckedBy(null);
            item.setCheckedAt(null);
        }

        item = groceryListItemRepository.save(item);
        GroceryListItemResponse response = toItemResponse(item);
        eventPublisher.itemChanged(householdId, response);
        return response;
    }

    @Transactional
    public void removeItem(UUID householdId, UUID itemId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        GroceryListItem item = findItem(householdId, itemId);
        groceryListItemRepository.delete(item);
        eventPublisher.itemRemoved(householdId, itemId);
    }

    /** Adds one meal's recipe ingredients to the household's list, skipping anything blacklisted. */
    @Transactional
    public List<GroceryListItemResponse> addMealToList(UUID householdId, UUID mealPlanEntryId, UUID requesterId) {
        Household household = requireMember(householdId, requesterId);

        MealPlanEntry entry = mealPlanEntryRepository.findById(mealPlanEntryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Meal plan entry not found"));
        if (!entry.getHousehold().getId().equals(householdId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Meal plan entry not found");
        }
        if (entry.getRecipe() == null) {
            return List.of();
        }

        Set<UUID> blacklisted = blacklistedIngredientRepository.findBlacklistedIngredientIds(householdId);
        int wantedServings = entry.getServings() != null ? entry.getServings() : household.getDefaultServings();
        return upsertFromRecipe(household, entry.getRecipe(), blacklisted, wantedServings);
    }

    /** Adds ingredients from every planned meal in the date range, skipping anything blacklisted. */
    @Transactional
    public List<GroceryListItemResponse> addAllPlannedToList(UUID householdId, UUID requesterId,
                                                               LocalDate start, LocalDate end) {
        Household household = requireMember(householdId, requesterId);

        List<MealPlanEntry> entries = mealPlanEntryRepository
                .findByHouseholdIdAndDateBetweenOrderByDateAscMealTypeAsc(householdId, start, end);
        Set<UUID> blacklisted = blacklistedIngredientRepository.findBlacklistedIngredientIds(householdId);

        return entries.stream()
                .filter(e -> e.getRecipe() != null)
                .flatMap(e -> {
                    int wantedServings = e.getServings() != null ? e.getServings() : household.getDefaultServings();
                    return upsertFromRecipe(household, e.getRecipe(), blacklisted, wantedServings).stream();
                })
                .toList();
    }

    /**
     * A recipe's ingredient quantities are written for {@code recipe.getServings()} people, so scale each
     * by (wantedServings / recipe.servings) to get the amount actually needed for this meal.
     */
    private List<GroceryListItemResponse> upsertFromRecipe(Household household, Recipe recipe,
                                                             Set<UUID> blacklisted, int wantedServings) {
        BigDecimal factor = BigDecimal.valueOf(wantedServings)
                .divide(BigDecimal.valueOf(recipe.getServings()), 4, RoundingMode.HALF_UP);

        return recipe.getIngredients().stream()
                .filter(ri -> !blacklisted.contains(ri.getIngredient().getId()))
                .map(ri -> upsertIngredient(household, ri.getIngredient(), ri.getQuantity().multiply(factor), ri.getUnit()))
                .toList();
    }

    private GroceryListItemResponse upsertIngredient(Household household, Ingredient ingredient,
                                                       BigDecimal quantity, String unit) {
        GroceryListItem item = groceryListItemRepository
                .findByHouseholdIdAndIngredientIdAndUnit(household.getId(), ingredient.getId(), unit)
                .orElseGet(() -> GroceryListItem.builder()
                        .household(household)
                        .ingredient(ingredient)
                        .quantity(BigDecimal.ZERO)
                        .unit(unit)
                        .build());

        item.setQuantity((item.getQuantity() == null ? BigDecimal.ZERO : item.getQuantity()).add(quantity));
        item = groceryListItemRepository.save(item);

        GroceryListItemResponse response = toItemResponse(item);
        eventPublisher.itemChanged(household.getId(), response);
        return response;
    }

    // --- Blacklist ---

    @Transactional(readOnly = true)
    public List<BlacklistEntryResponse> listBlacklist(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return blacklistedIngredientRepository.findByHouseholdId(householdId).stream()
                .map(b -> new BlacklistEntryResponse(b.getIngredient().getId(), b.getIngredient().getName()))
                .toList();
    }

    @Transactional
    public BlacklistEntryResponse addToBlacklist(UUID householdId, UUID requesterId, AddBlacklistRequest request) {
        Household household = requireMember(householdId, requesterId);
        Ingredient ingredient = ingredientService.findOrCreate(request.ingredientName(), null);

        if (!blacklistedIngredientRepository.existsByHouseholdIdAndIngredientId(householdId, ingredient.getId())) {
            blacklistedIngredientRepository.save(BlacklistedIngredient.builder()
                    .household(household)
                    .ingredient(ingredient)
                    .build());
        }
        return new BlacklistEntryResponse(ingredient.getId(), ingredient.getName());
    }

    @Transactional
    public void removeFromBlacklist(UUID householdId, UUID ingredientId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        blacklistedIngredientRepository.findByHouseholdIdAndIngredientId(householdId, ingredientId)
                .ifPresent(blacklistedIngredientRepository::delete);
    }

    private Household requireMember(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
    }

    private GroceryListItem findItem(UUID householdId, UUID itemId) {
        GroceryListItem item = groceryListItemRepository.findById(itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Item not found"));
        if (!item.getHousehold().getId().equals(householdId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Item not found");
        }
        return item;
    }

    private GroceryListItemResponse toItemResponse(GroceryListItem item) {
        String name = item.getIngredient() != null ? item.getIngredient().getName() : item.getCustomName();
        return new GroceryListItemResponse(
                item.getId(),
                item.getHousehold().getId(),
                item.getIngredient() != null ? item.getIngredient().getId() : null,
                name,
                item.getQuantity(),
                item.getUnit(),
                item.isChecked(),
                item.getCheckedBy() != null ? item.getCheckedBy().getId() : null,
                item.getCheckedBy() != null ? item.getCheckedBy().getDisplayName() : null,
                item.getCheckedAt());
    }
}
