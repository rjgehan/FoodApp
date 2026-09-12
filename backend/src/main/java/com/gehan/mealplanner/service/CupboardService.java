package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.BlacklistedIngredient;
import com.gehan.mealplanner.domain.CupboardItem;
import com.gehan.mealplanner.domain.GroceryListItem;
import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.domain.StockStatus;
import com.gehan.mealplanner.domain.StoreSection;
import com.gehan.mealplanner.dto.CupboardDtos.AddCupboardItemRequest;
import com.gehan.mealplanner.dto.CupboardDtos.CupboardItemResponse;
import com.gehan.mealplanner.dto.CupboardDtos.UpdateCupboardItemRequest;
import com.gehan.mealplanner.repository.BlacklistedIngredientRepository;
import com.gehan.mealplanner.repository.CupboardItemRepository;
import com.gehan.mealplanner.repository.GroceryListItemRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** What the household has in the house. See {@link CupboardItem}. */
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

    public CupboardService(CupboardItemRepository cupboardRepository,
                           HouseholdRepository householdRepository,
                           GroceryListItemRepository groceryRepository,
                           BlacklistedIngredientRepository legacyStapleRepository,
                           HouseholdService householdService,
                           IngredientService ingredientService,
                           IngredientSections ingredientSections,
                           GroceryListService groceryListService) {
        this.cupboardRepository = cupboardRepository;
        this.householdRepository = householdRepository;
        this.groceryRepository = groceryRepository;
        this.legacyStapleRepository = legacyStapleRepository;
        this.householdService = householdService;
        this.ingredientService = ingredientService;
        this.ingredientSections = ingredientSections;
        this.groceryListService = groceryListService;
    }

    @Transactional(readOnly = true)
    public List<CupboardItemResponse> list(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        Map<UUID, StoreSection> overrides = ingredientSections.overrides(householdId);
        Set<UUID> onList = onList(householdId);
        return cupboardRepository.findByHouseholdId(householdId).stream()
                .sorted(Comparator.comparing(c -> c.getIngredient().getName(), String.CASE_INSENSITIVE_ORDER))
                .map(c -> toResponse(c, overrides, onList))
                .toList();
    }

    /** Adding something already in the cupboard just says you have it again. */
    @Transactional
    public CupboardItemResponse add(UUID householdId, UUID requesterId, AddCupboardItemRequest request) {
        Household household = requireMember(householdId, requesterId);
        Ingredient ingredient = ingredientService.findOrCreate(request.name(), null);

        CupboardItem item = cupboardRepository.findByHouseholdIdAndIngredientId(householdId, ingredient.getId())
                .orElseGet(() -> CupboardItem.builder().household(household).ingredient(ingredient).build());
        item.setStatus(StockStatus.HAVE);
        if (Boolean.TRUE.equals(request.staple())) {
            item.setStaple(true);
        }
        item.setUpdatedAt(Instant.now());
        return toResponse(cupboardRepository.save(item), householdId);
    }

    /** Low and Out put it on the grocery list — that is what running low is for. */
    @Transactional
    public CupboardItemResponse update(UUID householdId, UUID itemId, UUID requesterId,
                                       UpdateCupboardItemRequest request) {
        householdService.assertMember(householdId, requesterId);
        CupboardItem item = findItem(householdId, itemId);

        if (request.status() != null && request.status() != item.getStatus()) {
            item.setStatus(request.status());
            if (request.status() != StockStatus.HAVE) {
                groceryListService.ensureOnList(item.getHousehold(), item.getIngredient());
            }
        }
        if (request.staple() != null) {
            item.setStaple(request.staple());
        }
        item.setUpdatedAt(Instant.now());
        return toResponse(cupboardRepository.save(item), householdId);
    }

    @Transactional
    public void remove(UUID householdId, UUID itemId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        cupboardRepository.delete(findItem(householdId, itemId));
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

    private Household requireMember(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
    }

    private CupboardItemResponse toResponse(CupboardItem item, UUID householdId) {
        return toResponse(item, ingredientSections.overrides(householdId), onList(householdId));
    }

    private CupboardItemResponse toResponse(CupboardItem item, Map<UUID, StoreSection> overrides, Set<UUID> onList) {
        Ingredient ingredient = item.getIngredient();
        return new CupboardItemResponse(
                item.getId(),
                ingredient.getId(),
                ingredient.getName(),
                item.getStatus(),
                item.isStaple(),
                IngredientSections.resolve(ingredient, overrides),
                IngredientSections.isSorted(ingredient, overrides),
                onList.contains(ingredient.getId()));
    }
}
