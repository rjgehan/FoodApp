package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.BlacklistedIngredient;
import com.gehan.mealplanner.domain.CupboardItem;
import com.gehan.mealplanner.domain.GroceryCategory;
import com.gehan.mealplanner.domain.GroceryListItem;
import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.dto.CupboardDtos.AddCupboardItemRequest;
import com.gehan.mealplanner.dto.CupboardDtos.AddStartersResponse;
import com.gehan.mealplanner.dto.CupboardDtos.CopyCupboardResponse;
import com.gehan.mealplanner.dto.CupboardDtos.CupboardItemResponse;
import com.gehan.mealplanner.dto.CupboardDtos.StarterGroup;
import com.gehan.mealplanner.dto.CupboardDtos.StarterItem;
import com.gehan.mealplanner.dto.CupboardDtos.UpdateCupboardItemRequest;
import com.gehan.mealplanner.repository.BlacklistedIngredientRepository;
import com.gehan.mealplanner.repository.CupboardItemRepository;
import com.gehan.mealplanner.repository.GroceryListItemRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * What the household has in the house. See {@link CupboardItem}. Remove and Buy again are
 * separate on purpose: most of the time a finished jar just goes, and only sometimes do you want
 * another — so the grocery list is only touched when you say so.
 */
@Service
public class CupboardService {

    private final CupboardItemRepository cupboardRepository;
    private final HouseholdRepository householdRepository;
    private final GroceryListItemRepository groceryRepository;
    private final BlacklistedIngredientRepository legacyStapleRepository;
    private final HouseholdService householdService;
    private final IngredientService ingredientService;
    private final IngredientSections ingredientSections;
    private final GroceryListService groceryListService;
    private final RestockClock restockClock;

    public CupboardService(CupboardItemRepository cupboardRepository,
                           HouseholdRepository householdRepository,
                           GroceryListItemRepository groceryRepository,
                           BlacklistedIngredientRepository legacyStapleRepository,
                           HouseholdService householdService,
                           IngredientService ingredientService,
                           IngredientSections ingredientSections,
                           GroceryListService groceryListService,
                           RestockClock restockClock) {
        this.cupboardRepository = cupboardRepository;
        this.householdRepository = householdRepository;
        this.groceryRepository = groceryRepository;
        this.legacyStapleRepository = legacyStapleRepository;
        this.householdService = householdService;
        this.ingredientService = ingredientService;
        this.ingredientSections = ingredientSections;
        this.groceryListService = groceryListService;
        this.restockClock = restockClock;
    }

    @Transactional(readOnly = true)
    public List<CupboardItemResponse> list(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        Map<UUID, GroceryCategory> overrides = ingredientSections.overrides(householdId);
        List<GroceryCategory> categories = ingredientSections.categories(householdId);
        Set<UUID> onList = onList(householdId);
        return cupboardRepository.findByHouseholdId(householdId).stream()
                .sorted(Comparator.comparing(c -> c.getIngredient().getName(), String.CASE_INSENSITIVE_ORDER))
                .map(c -> toResponse(c, overrides, categories, onList))
                .toList();
    }

    /**
     * Adding something already in the cupboard says you have it again, no longer running low —
     * which is also what a double tap on Add comes to: the second waits behind the first, then
     * finds the item there. Having it again is having bought it, as far as a restock reminder
     * is concerned, so its clock starts over.
     */
    @Transactional
    public CupboardItemResponse add(UUID householdId, UUID requesterId, AddCupboardItemRequest request) {
        Household household = requireMember(householdId, requesterId);
        Ingredient ingredient = ingredientService.findOrCreate(request.name(), null);

        CupboardItem item = cupboardRepository.findByHouseholdIdAndIngredientId(householdId, ingredient.getId())
                .orElseGet(() -> CupboardItem.builder().household(household).ingredient(ingredient).build());
        item.setRunningLow(false);
        if (Boolean.TRUE.equals(request.staple())) {
            item.setStaple(true);
        }
        restockClock.bought(householdId, ingredient.getId());
        return toResponse(cupboardRepository.save(item), householdId);
    }

    @Transactional
    public CupboardItemResponse update(UUID householdId, UUID itemId, UUID requesterId,
                                       UpdateCupboardItemRequest request) {
        requireMember(householdId, requesterId);
        CupboardItem item = findItem(householdId, itemId);

        // A rename is a typo fixed or a thing made more specific — "eggs" to "large eggs". It
        // points this item at the other ingredient rather than renaming the shared ingredient,
        // which the grocery list and every recipe also use.
        if (request.name() != null && !request.name().isBlank()) {
            Ingredient renamed = ingredientService.findOrCreate(request.name(), null);
            if (!renamed.getId().equals(item.getIngredient().getId())) {
                restockClock.moved(householdId, item.getIngredient().getId(), renamed);
                var clash = cupboardRepository.findByHouseholdIdAndIngredientId(householdId, renamed.getId());
                if (clash.isPresent()) {
                    // Renamed into something already here: that is one thing now, not two.
                    CupboardItem kept = clash.get();
                    kept.setStaple(kept.isStaple() || item.isStaple() || Boolean.TRUE.equals(request.staple()));
                    if (request.runningLow() != null) {
                        kept.setRunningLow(request.runningLow());
                    }
                    cupboardRepository.delete(item);
                    return toResponse(cupboardRepository.save(kept), householdId);
                }
                item.setIngredient(renamed);
            }
        }
        if (request.runningLow() != null) {
            item.setRunningLow(request.runningLow());
        }
        if (request.staple() != null) {
            item.setStaple(request.staple());
        }
        if (Boolean.FALSE.equals(request.trackQuantity())) {
            item.setQuantity(null);
            item.setUnit(null);
        } else if (Boolean.TRUE.equals(request.trackQuantity()) || item.getQuantity() != null) {
            if (request.quantity() != null) {
                item.setQuantity(request.quantity());
            } else if (item.getQuantity() == null) {
                // Switching into quantity mode with no starting amount given — zero is a real count.
                item.setQuantity(BigDecimal.ZERO);
            }
            if (request.unit() != null) {
                item.setUnit(blankToNull(request.unit()));
            }
        }
        return toResponse(cupboardRepository.save(item), householdId);
    }

    /** Nudges an item already tracking an exact amount up or down — never below zero. */
    @Transactional
    public CupboardItemResponse adjustQuantity(UUID householdId, UUID itemId, UUID requesterId, BigDecimal delta) {
        requireMember(householdId, requesterId);
        CupboardItem item = findItem(householdId, itemId);
        BigDecimal current = item.getQuantity() != null ? item.getQuantity() : BigDecimal.ZERO;
        BigDecimal next = current.add(delta);
        item.setQuantity(next.max(BigDecimal.ZERO));
        return toResponse(cupboardRepository.save(item), householdId);
    }

    private static String blankToNull(String value) {
        return value.isBlank() ? null : value.trim();
    }

    /** Used up, and that is all. */
    @Transactional
    public void remove(UUID householdId, UUID itemId, UUID requesterId) {
        requireMember(householdId, requesterId);
        cupboardRepository.delete(findItem(householdId, itemId));
    }

    /**
     * Used up and wanted again: out of the cupboard and onto the grocery list in one go, so the
     * two can never disagree. "Done shopping" brings it back once it is bought.
     */
    @Transactional
    public void buyAgain(UUID householdId, UUID itemId, UUID requesterId) {
        requireMember(householdId, requesterId);
        CupboardItem item = findItem(householdId, itemId);
        groceryListService.ensureOnList(householdId, item.getIngredient().getId(), requesterId);
        cupboardRepository.delete(item);
    }

    /** The starter list, each thing marked if this cupboard already has it. */
    @Transactional(readOnly = true)
    public List<StarterGroup> starters(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        Set<String> here = namesHere(householdId);
        return StarterCupboard.GROUPS.stream()
                .map(g -> new StarterGroup(g.name(), g.items().stream()
                        .map(name -> new StarterItem(name, here.contains(IngredientService.normalize(name))))
                        .toList()))
                .toList();
    }

    /**
     * Many things at once, ticked on the starter list — one request, so a new house is filled
     * in a moment rather than a name at a time. Anything already here is left exactly as it is:
     * ticking "rice" says you have some, not that the rice you marked low is fine again.
     * Otherwise each goes in the way one typed into the cupboard does, and lands in the same
     * aisle.
     */
    @Transactional
    public AddStartersResponse addStarters(UUID householdId, UUID requesterId, List<String> names) {
        Household household = requireMember(householdId, requesterId);
        Set<String> here = namesHere(householdId);
        int added = 0;
        int skipped = 0;
        for (String name : names) {
            String normalized = IngredientService.normalize(name);
            if (normalized.isEmpty()) {
                continue;
            }
            // Also true of a name sent twice: the second finds the first.
            if (!here.add(normalized)) {
                skipped++;
                continue;
            }
            Ingredient ingredient = ingredientService.findOrCreate(name, null);
            cupboardRepository.save(CupboardItem.builder().household(household).ingredient(ingredient).build());
            added++;
        }
        return new AddStartersResponse(added, skipped);
    }

    /**
     * Everything in another of your households' cupboards, copied into this one — for somebody
     * with two houses setting up the second, once. Only what this cupboard does not have yet
     * comes across, with its amount, whether it is low and whether it is always had; what is
     * here already is left alone. The aisle comes too, when the other house moved it into an
     * aisle this one also has by that name; otherwise it goes wherever this house would put it.
     *
     * You have to be in both. Only this household is locked: the other is only read.
     */
    @Transactional
    public CopyCupboardResponse copyFrom(UUID householdId, UUID sourceHouseholdId, UUID requesterId) {
        if (householdId.equals(sourceHouseholdId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That's this household's own cupboard.");
        }
        householdService.assertMember(sourceHouseholdId, requesterId);
        Household household = requireMember(householdId, requesterId);

        Set<UUID> here = cupboardRepository.findByHouseholdId(householdId).stream()
                .map(c -> c.getIngredient().getId())
                .collect(Collectors.toCollection(HashSet::new));
        Map<UUID, GroceryCategory> theirAisles = ingredientSections.overrides(sourceHouseholdId);
        Map<UUID, GroceryCategory> ourAisles = ingredientSections.overrides(householdId);
        List<GroceryCategory> ourCategories = ingredientSections.categories(householdId);
        Map<String, GroceryCategory> ourCategoriesByName = ourCategories.stream()
                .collect(Collectors.toMap(c -> c.getName().trim().toLowerCase(), Function.identity(), (a, b) -> a));

        int copied = 0;
        int skipped = 0;
        for (CupboardItem theirs : cupboardRepository.findByHouseholdId(sourceHouseholdId)) {
            Ingredient ingredient = theirs.getIngredient();
            if (!here.add(ingredient.getId())) {
                skipped++;
                continue;
            }
            cupboardRepository.save(CupboardItem.builder()
                    .household(household)
                    .ingredient(ingredient)
                    .staple(theirs.isStaple())
                    .runningLow(theirs.isRunningLow())
                    .quantity(theirs.getQuantity())
                    .unit(theirs.getUnit())
                    .build());
            copied++;

            GroceryCategory theirAisle = theirAisles.get(ingredient.getId());
            GroceryCategory sameAisle = theirAisle == null ? null
                    : ourCategoriesByName.get(theirAisle.getName().trim().toLowerCase());
            if (sameAisle != null && !ourAisles.containsKey(ingredient.getId())
                    && IngredientSections.resolve(ingredient, ourAisles, ourCategories) != sameAisle) {
                ingredientSections.move(household, ingredient, sameAisle);
            }
        }
        return new CopyCupboardResponse(copied, skipped);
    }

    /** What is in this cupboard, by the spelling ingredients are matched on. */
    private Set<String> namesHere(UUID householdId) {
        return cupboardRepository.findByHouseholdId(householdId).stream()
                .map(c -> c.getIngredient().getNormalizedName())
                .collect(Collectors.toCollection(HashSet::new));
    }

    /**
     * The grocery list's old "Pantry staples" were the same idea as the cupboard, so they live
     * here now as items marked staple. Runs on every start and only moves what is still in the
     * old table, so it is safe to repeat. Returns how many it moved.
     */
    @Transactional
    public int moveLegacyStaples() {
        List<BlacklistedIngredient> legacy = legacyStapleRepository.findAll();
        for (BlacklistedIngredient old : legacy) {
            CupboardItem item = cupboardRepository
                    .findByHouseholdIdAndIngredientId(old.getHousehold().getId(), old.getIngredient().getId())
                    .orElseGet(() -> CupboardItem.builder()
                            .household(old.getHousehold())
                            .ingredient(old.getIngredient())
                            .build());
            item.setStaple(true);
            cupboardRepository.save(item);
        }
        legacyStapleRepository.deleteAll(legacy);
        return legacy.size();
    }

    private Set<UUID> onList(UUID householdId) {
        return groceryRepository.findByHouseholdId(householdId).stream()
                .filter(g -> !g.isChecked() && g.getIngredient() != null)
                .map(GroceryListItem::getIngredient)
                .map(Ingredient::getId)
                .collect(Collectors.toSet());
    }

    private CupboardItem findItem(UUID householdId, UUID itemId) {
        CupboardItem item = cupboardRepository.findById(itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Not in the cupboard"));
        if (!item.getHousehold().getId().equals(householdId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Not in the cupboard");
        }
        return item;
    }

    /**
     * The household, locked until the change is saved — the same lock the grocery list takes, so
     * two phones changing the cupboard, or one adding while another presses Done shopping, go
     * one after the other. Side by side, both could find no "rice" and both add it, and the
     * second would break the one-row-per-thing rule; or both could count 3 cans down to 2.
     * Taken before any item is read, so what is read is current.
     */
    private Household requireMember(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return householdRepository.lockById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
    }

    private CupboardItemResponse toResponse(CupboardItem item, UUID householdId) {
        return toResponse(item, ingredientSections.overrides(householdId), ingredientSections.categories(householdId),
                onList(householdId));
    }

    private CupboardItemResponse toResponse(CupboardItem item, Map<UUID, GroceryCategory> overrides,
                                             List<GroceryCategory> categories, Set<UUID> onList) {
        Ingredient ingredient = item.getIngredient();
        GroceryCategory category = IngredientSections.resolve(ingredient, overrides, categories);
        return new CupboardItemResponse(
                item.getId(),
                ingredient.getId(),
                ingredient.getName(),
                item.isRunningLow(),
                item.isStaple(),
                category != null ? category.getId() : null,
                category != null,
                onList.contains(ingredient.getId()),
                item.getQuantity(),
                item.getUnit());
    }
}
