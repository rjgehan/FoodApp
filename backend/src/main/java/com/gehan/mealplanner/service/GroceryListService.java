package com.gehan.mealplanner.service;

import com.gehan.mealplanner.ai.StoreSectionAi;
import com.gehan.mealplanner.domain.*;
import com.gehan.mealplanner.dto.GroceryListDtos.AddItemRequest;
import com.gehan.mealplanner.dto.GroceryListDtos.GroceryListItemResponse;
import com.gehan.mealplanner.dto.GroceryListDtos.PutAwayRequest;
import com.gehan.mealplanner.dto.GroceryListDtos.SortResponse;
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
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class GroceryListService {

    private final GroceryListItemRepository groceryListItemRepository;
    private final MealPlanEntryRepository mealPlanEntryRepository;
    private final HouseholdRepository householdRepository;
    private final UserRepository userRepository;
    private final IngredientRepository ingredientRepository;
    private final CupboardItemRepository cupboardRepository;
    private final HouseholdService householdService;
    private final IngredientService ingredientService;
    private final IngredientSections ingredientSections;
    private final StoreSectionAi sectionAi;
    private final GroceryListEventPublisher eventPublisher;

    public GroceryListService(GroceryListItemRepository groceryListItemRepository,
                               MealPlanEntryRepository mealPlanEntryRepository,
                               HouseholdRepository householdRepository,
                               UserRepository userRepository,
                               IngredientRepository ingredientRepository,
                               CupboardItemRepository cupboardRepository,
                               HouseholdService householdService,
                               IngredientService ingredientService,
                               IngredientSections ingredientSections,
                               StoreSectionAi sectionAi,
                               GroceryListEventPublisher eventPublisher) {
        this.groceryListItemRepository = groceryListItemRepository;
        this.mealPlanEntryRepository = mealPlanEntryRepository;
        this.householdRepository = householdRepository;
        this.userRepository = userRepository;
        this.ingredientRepository = ingredientRepository;
        this.cupboardRepository = cupboardRepository;
        this.householdService = householdService;
        this.ingredientService = ingredientService;
        this.ingredientSections = ingredientSections;
        this.sectionAi = sectionAi;
        this.eventPublisher = eventPublisher;
    }

    /**
     * What an item's response needs beyond the item: this household's category corrections, its
     * live category list (for resolving a keyword/Gemini guess into one of them), and its
     * cupboard. Loaded once per request instead of once per item.
     */
    private record Context(Map<UUID, GroceryCategory> sections, List<GroceryCategory> categories,
                            Map<UUID, CupboardItem> cupboard) {

        boolean isStaple(Ingredient ingredient) {
            CupboardItem item = cupboard.get(ingredient.getId());
            return item != null && item.isStaple();
        }

        /** Enough to count on: in the cupboard, and not running low. */
        boolean has(Ingredient ingredient) {
            CupboardItem item = cupboard.get(ingredient.getId());
            return item != null && !item.isRunningLow();
        }
    }

    private Context context(UUID householdId) {
        Map<UUID, CupboardItem> cupboard = new HashMap<>();
        cupboardRepository.findByHouseholdId(householdId).forEach(c -> cupboard.put(c.getIngredient().getId(), c));
        return new Context(ingredientSections.overrides(householdId), ingredientSections.categories(householdId), cupboard);
    }

    @Transactional(readOnly = true)
    public List<GroceryListItemResponse> listItems(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        Context ctx = context(householdId);
        return groceryListItemRepository.findByHouseholdId(householdId).stream()
                .map(item -> toItemResponse(item, ctx))
                .toList();
    }

    @Transactional
    public GroceryListItemResponse addManualItem(UUID householdId, UUID requesterId, AddItemRequest request) {
        householdService.assertMember(householdId, requesterId);
        return addItem(householdId, request);
    }

    /**
     * The same add with no user behind it, for the integration API. Kept here rather than
     * reimplemented by the caller so the websocket broadcast still fires — a dashboard adding
     * milk has to show up on the phone in the kitchen without a refresh.
     */
    @Transactional
    public GroceryListItemResponse addItem(UUID householdId, AddItemRequest request) {
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
        String unit = blankToNull(request.unit());
        Ingredient ingredient = request.ingredientName() != null
                ? ingredientService.findOrCreate(request.ingredientName(), unit)
                : null;

        GroceryListItem item = GroceryListItem.builder()
                .household(household)
                .ingredient(ingredient)
                .customName(request.ingredientName())
                .quantity(request.quantity())
                .unit(unit)
                .build();
        item = groceryListItemRepository.save(item);

        GroceryListItemResponse response = toItemResponse(item, context(householdId));
        eventPublisher.itemChanged(householdId, response);
        return response;
    }

    /**
     * The cupboard's Buy again: on the list, unless it is already there waiting — so two phones
     * doing it at once still means one row. No amount: you know how many you buy.
     */
    @Transactional
    public void ensureOnList(UUID householdId, UUID ingredientId, UUID requesterId) {
        Household household = requireMember(householdId, requesterId);
        Ingredient ingredient = ingredientRepository.findById(ingredientId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ingredient not found"));
        ensureOnList(household, ingredient);
    }

    private void ensureOnList(Household household, Ingredient ingredient) {
        if (!groceryListItemRepository
                .findByHouseholdIdAndIngredientIdAndCheckedFalse(household.getId(), ingredient.getId()).isEmpty()) {
            return;
        }
        GroceryListItem item = groceryListItemRepository.save(GroceryListItem.builder()
                .household(household)
                .ingredient(ingredient)
                .build());
        eventPublisher.itemChanged(household.getId(), toItemResponse(item, context(household.getId())));
    }

    /** Toggles an item's checked state and broadcasts the change to everyone watching this list in real time. */
    @Transactional
    public GroceryListItemResponse setChecked(UUID householdId, UUID itemId, UUID requesterId, boolean checked) {
        householdService.assertMember(householdId, requesterId);
        return setChecked(householdId, itemId, checked, userRepository.findById(requesterId).orElse(null));
    }

    /** `by` is null when nobody in particular did it — a dashboard, say. */
    @Transactional
    public GroceryListItemResponse setChecked(UUID householdId, UUID itemId, boolean checked, User by) {
        GroceryListItem item = findItem(householdId, itemId);

        item.setChecked(checked);
        if (checked) {
            item.setCheckedBy(by);
            item.setCheckedAt(Instant.now());
        } else {
            item.setCheckedBy(null);
            item.setCheckedAt(null);
        }

        item = groceryListItemRepository.save(item);
        GroceryListItemResponse response = toItemResponse(item, context(householdId));
        eventPublisher.itemChanged(householdId, response);
        return response;
    }

    @Transactional
    public void removeItem(UUID householdId, UUID itemId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        removeItem(householdId, itemId);
    }

    @Transactional
    public void removeItem(UUID householdId, UUID itemId) {
        GroceryListItem item = findItem(householdId, itemId);
        groceryListItemRepository.delete(item);
        eventPublisher.itemRemoved(householdId, itemId);
    }

    /**
     * "Done shopping": everything named comes off the list, and the `putAway` ones are marked as
     * in the cupboard. Deciding what was for someone else here, at the moment you know, beats
     * deleting it from the cupboard days later. Ids already gone — someone else pressed it on
     * their phone a second earlier — are skipped rather than failing the whole thing.
     */
    @Transactional
    public void putAway(UUID householdId, UUID requesterId, PutAwayRequest request) {
        Household household = requireMember(householdId, requesterId);
        if (request.leaveOut() != null) {
            request.leaveOut().forEach(id -> takeOff(householdId, id, null));
        }
        if (request.putAway() != null) {
            request.putAway().forEach(id -> takeOff(householdId, id, household));
        }
    }

    private void takeOff(UUID householdId, UUID itemId, Household stockInto) {
        groceryListItemRepository.findById(itemId)
                .filter(item -> item.getHousehold().getId().equals(householdId))
                .ifPresent(item -> {
                    if (stockInto != null && item.getIngredient() != null) {
                        stock(stockInto, item.getIngredient());
                    }
                    groceryListItemRepository.delete(item);
                    eventPublisher.itemRemoved(householdId, itemId);
                });
    }

    /** Just bought: in the cupboard, and no longer running low if it was. */
    private void stock(Household household, Ingredient ingredient) {
        CupboardItem item = cupboardRepository.findByHouseholdIdAndIngredientId(household.getId(), ingredient.getId())
                .orElseGet(() -> CupboardItem.builder().household(household).ingredient(ingredient).build());
        item.setRunningLow(false);
        cupboardRepository.save(item);
    }

    /**
     * One planned entry, on purpose. For a single item this is the only way onto the list —
     * planning eggs for breakfast says nothing about needing to buy eggs, so the week and day
     * buttons leave items alone. Asked for by hand, it goes on even if the cupboard has some.
     */
    @Transactional
    public List<GroceryListItemResponse> addMealToList(UUID householdId, UUID mealPlanEntryId, UUID requesterId) {
        Household household = requireMember(householdId, requesterId);

        MealPlanEntry entry = mealPlanEntryRepository.findById(mealPlanEntryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Meal plan entry not found"));
        if (!entry.getHousehold().getId().equals(householdId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Meal plan entry not found");
        }
        Context ctx = context(householdId);
        if (entry.getItem() != null) {
            return List.of(upsertIngredient(household, entry.getItem(), null, null, ctx));
        }
        return addRecipe(household, entry, ctx);
    }

    /** Adds the meals planned in the date range. Meals only: single items have their own button. */
    @Transactional
    public List<GroceryListItemResponse> addAllPlannedToList(UUID householdId, UUID requesterId,
                                                               LocalDate start, LocalDate end) {
        Household household = requireMember(householdId, requesterId);
        Context ctx = context(householdId);

        return mealPlanEntryRepository
                .findByHouseholdIdAndDateBetweenOrderByDateAscMealTypeAsc(householdId, start, end).stream()
                .flatMap(e -> addRecipe(household, e, ctx).stream())
                .toList();
    }

    /** A planned recipe's ingredients. Anything else — a night out, a single item — adds nothing here. */
    private List<GroceryListItemResponse> addRecipe(Household household, MealPlanEntry entry, Context ctx) {
        if (entry.getRecipe() == null) {
            return List.of();
        }
        int wantedServings = entry.getServings() != null ? entry.getServings() : household.getDefaultServings();
        return upsertFromRecipe(household, entry.getRecipe(), wantedServings, ctx);
    }

    /**
     * A recipe's ingredient quantities are written for {@code recipe.getServings()} people, so scale each
     * by (wantedServings / recipe.servings) to get the amount actually needed for this meal.
     *
     * Things the cupboard says you have still go on — flagged, not skipped, because having some
     * paprika does not mean having enough. Staples you always have are left off entirely.
     */
    private List<GroceryListItemResponse> upsertFromRecipe(Household household, Recipe recipe,
                                                             int wantedServings, Context ctx) {
        BigDecimal factor = BigDecimal.valueOf(wantedServings)
                .divide(BigDecimal.valueOf(recipe.getServings()), 4, RoundingMode.HALF_UP);

        return recipe.getIngredients().stream()
                .filter(ri -> !ctx.isStaple(ri.getIngredient()))
                .map(ri -> upsertIngredient(household, ri.getIngredient(), ri.getQuantity().multiply(factor),
                        ri.getUnit(), ctx))
                .toList();
    }

    /** A null quantity means "some" — a planned single item has no amount, and adds none. */
    private GroceryListItemResponse upsertIngredient(Household household, Ingredient ingredient,
                                                       BigDecimal quantity, String unit, Context ctx) {
        String normalizedUnit = blankToNull(unit);
        GroceryListItem item = groceryListItemRepository
                .findByHouseholdIdAndIngredientIdAndUnitAndCheckedFalse(household.getId(), ingredient.getId(), normalizedUnit)
                .stream().findFirst()
                .orElseGet(() -> GroceryListItem.builder()
                        .household(household)
                        .ingredient(ingredient)
                        .unit(normalizedUnit)
                        .build());

        if (quantity != null) {
            item.setQuantity(item.getQuantity() == null ? quantity : item.getQuantity().add(quantity));
        }
        item = groceryListItemRepository.save(item);

        GroceryListItemResponse response = toItemResponse(item, ctx);
        eventPublisher.itemChanged(household.getId(), response);
        return response;
    }

    // --- Categories ---

    /** "Tortillas are with the bread at our store." Sticks for this household only. */
    @Transactional
    public void moveToCategory(UUID householdId, UUID ingredientId, UUID requesterId, UUID categoryId) {
        Household household = requireMember(householdId, requesterId);
        Ingredient ingredient = ingredientRepository.findById(ingredientId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ingredient not found"));
        GroceryCategory category = requireCategory(householdId, categoryId);
        ingredientSections.move(household, ingredient, category);
        broadcast(householdId, List.of(ingredientId));
    }

    /**
     * Places everything nobody has placed yet, in ONE Gemini request into this household's own
     * categories. One, because the key allows twenty a day across the whole app — so this is a
     * button someone presses once the list is finished, and never something that runs by itself.
     * The cupboard's unplaced items ride along in the same request. With nothing unplaced, no
     * request is made at all.
     */
    @Transactional
    public SortResponse sort(UUID householdId, UUID requesterId) {
        Household household = requireMember(householdId, requesterId);
        Map<UUID, GroceryCategory> overrides = ingredientSections.overrides(householdId);
        List<GroceryCategory> categories = ingredientSections.categories(householdId);

        Map<UUID, Ingredient> unsorted = new LinkedHashMap<>();
        groceryListItemRepository.findByHouseholdId(householdId).stream()
                .map(GroceryListItem::getIngredient)
                .filter(i -> i != null && !IngredientSections.isSorted(i, overrides, categories))
                .forEach(i -> unsorted.putIfAbsent(i.getId(), i));
        cupboardRepository.findByHouseholdId(householdId).stream()
                .map(CupboardItem::getIngredient)
                .filter(i -> !IngredientSections.isSorted(i, overrides, categories))
                .forEach(i -> unsorted.putIfAbsent(i.getId(), i));

        if (unsorted.isEmpty()) {
            return new SortResponse(0, 0);
        }

        Map<String, UUID> answers = sectionAi.classify(
                unsorted.values().stream().map(Ingredient::getName).toList(), categories);
        Map<UUID, GroceryCategory> categoriesById = categories.stream()
                .collect(Collectors.toMap(GroceryCategory::getId, c -> c));

        int sorted = 0;
        for (Ingredient ingredient : unsorted.values()) {
            UUID categoryId = answers.get(ingredient.getName().trim().toLowerCase());
            GroceryCategory category = categoryId != null ? categoriesById.get(categoryId) : null;
            if (category != null) {
                ingredientSections.move(household, ingredient, category);
                sorted++;
            }
        }
        broadcast(householdId, unsorted.keySet());
        return new SortResponse(sorted, unsorted.size() - sorted);
    }

    private GroceryCategory requireCategory(UUID householdId, UUID categoryId) {
        return ingredientSections.categories(householdId).stream()
                .filter(c -> c.getId().equals(categoryId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));
    }

    /** Re-sends the items for these ingredients, so every open phone moves them to the new aisle. */
    private void broadcast(UUID householdId, Collection<UUID> ingredientIds) {
        Context ctx = context(householdId);
        groceryListItemRepository.findByHouseholdId(householdId).stream()
                .filter(item -> item.getIngredient() != null && ingredientIds.contains(item.getIngredient().getId()))
                .forEach(item -> eventPublisher.itemChanged(householdId, toItemResponse(item, ctx)));
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

    /** The unit box sends "" when left empty; stored as null so "eggs" and "eggs" are one row. */
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private GroceryListItemResponse toItemResponse(GroceryListItem item, Context ctx) {
        Ingredient ingredient = item.getIngredient();
        String name = ingredient != null ? ingredient.getName() : item.getCustomName();
        GroceryCategory category = ingredient != null
                ? IngredientSections.resolve(ingredient, ctx.sections(), ctx.categories())
                : null;
        return new GroceryListItemResponse(
                item.getId(),
                item.getHousehold().getId(),
                ingredient != null ? ingredient.getId() : null,
                name,
                item.getQuantity(),
                item.getUnit(),
                item.isChecked(),
                item.getCheckedBy() != null ? item.getCheckedBy().getId() : null,
                item.getCheckedBy() != null ? item.getCheckedBy().getDisplayName() : null,
                item.getCheckedAt(),
                category != null ? category.getId() : null,
                ingredient == null || category != null,
                ingredient != null && ctx.has(ingredient));
    }
}
