package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.GroceryCategory;
import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.StoreSection;
import com.gehan.mealplanner.dto.GroceryCategoryDtos.GroceryCategoryResponse;
import com.gehan.mealplanner.repository.GroceryCategoryRepository;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.IngredientSectionRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A household's own grocery aisles. Every household gets the original twelve to start (see
 * {@link #seedDefaults}), each linked back to the {@link StoreSection} it came from so the free
 * keyword pass keeps working until the household actually changes what a category means —
 * renaming "Produce" does not break the link, adding "Pharmacy" or deleting "Deli" does.
 */
@Service
public class GroceryCategoryService {

    /** Order and wording a brand new household starts with — same twelve as the old fixed list. */
    private static final Map<StoreSection, String> DEFAULTS = new LinkedHashMap<>();

    static {
        DEFAULTS.put(StoreSection.PRODUCE, "Produce");
        DEFAULTS.put(StoreSection.BAKERY, "Bread & bakery");
        DEFAULTS.put(StoreSection.DRY_GOODS, "Dry goods");
        DEFAULTS.put(StoreSection.BAKING, "Baking");
        DEFAULTS.put(StoreSection.SPICES, "Spices");
        DEFAULTS.put(StoreSection.DELI, "Deli");
        DEFAULTS.put(StoreSection.MEAT, "Meat & seafood");
        DEFAULTS.put(StoreSection.DAIRY, "Dairy & eggs");
        DEFAULTS.put(StoreSection.FROZEN, "Frozen");
        DEFAULTS.put(StoreSection.DRINKS, "Drinks");
        DEFAULTS.put(StoreSection.HOUSEHOLD, "Household");
        DEFAULTS.put(StoreSection.OTHER, "Other");
    }

    private final GroceryCategoryRepository repository;
    private final HouseholdRepository householdRepository;
    private final HouseholdMemberRepository memberRepository;
    private final IngredientSectionRepository ingredientSectionRepository;

    public GroceryCategoryService(GroceryCategoryRepository repository,
                                   HouseholdRepository householdRepository,
                                   HouseholdMemberRepository memberRepository,
                                   IngredientSectionRepository ingredientSectionRepository) {
        this.repository = repository;
        this.householdRepository = householdRepository;
        this.memberRepository = memberRepository;
        this.ingredientSectionRepository = ingredientSectionRepository;
    }

    /** The default twelve, in their default order — only for a household with none yet. */
    @Transactional
    public void seedDefaults(Household household) {
        if (repository.existsByHouseholdId(household.getId())) {
            return;
        }
        int position = 0;
        for (Map.Entry<StoreSection, String> entry : DEFAULTS.entrySet()) {
            repository.save(GroceryCategory.builder()
                    .household(household)
                    .name(entry.getValue())
                    .position(position++)
                    .seededFrom(entry.getKey())
                    .build());
        }
    }

    @Transactional(readOnly = true)
    public List<GroceryCategoryResponse> list(UUID householdId, UUID requesterId) {
        assertMember(householdId, requesterId);
        return repository.findByHouseholdIdOrderByPosition(householdId).stream()
                .map(GroceryCategoryService::toResponse)
                .toList();
    }

    @Transactional
    public GroceryCategoryResponse create(UUID householdId, UUID requesterId, String name) {
        Household household = requireMember(householdId, requesterId);
        int nextPosition = repository.findByHouseholdIdOrderByPosition(householdId).stream()
                .mapToInt(GroceryCategory::getPosition).max().orElse(-1) + 1;
        try {
            return toResponse(repository.save(GroceryCategory.builder()
                    .household(household)
                    .name(name.trim())
                    .position(nextPosition)
                    .build()));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Already have a category with that name");
        }
    }

    @Transactional
    public GroceryCategoryResponse rename(UUID householdId, UUID categoryId, UUID requesterId, String name) {
        assertMember(householdId, requesterId);
        GroceryCategory category = findCategory(householdId, categoryId);
        category.setName(name.trim());
        try {
            return toResponse(repository.save(category));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Already have a category with that name");
        }
    }

    /** Every category's id, in the new order — anything left out keeps its old position at the end. */
    @Transactional
    public List<GroceryCategoryResponse> reorder(UUID householdId, UUID requesterId, List<UUID> order) {
        assertMember(householdId, requesterId);
        List<GroceryCategory> categories = repository.findByHouseholdIdOrderByPosition(householdId);
        Map<UUID, GroceryCategory> byId = new LinkedHashMap<>();
        categories.forEach(c -> byId.put(c.getId(), c));

        int position = 0;
        for (UUID id : order) {
            GroceryCategory category = byId.remove(id);
            if (category != null) {
                category.setPosition(position++);
                repository.save(category);
            }
        }
        // Anything not named (should not happen from the app's own UI) keeps going after the rest.
        for (GroceryCategory leftover : byId.values()) {
            leftover.setPosition(position++);
            repository.save(leftover);
        }
        return list(householdId, requesterId);
    }

    /**
     * Deletes a category. Anything a household had placed there simply becomes unsorted again —
     * one tap to fix, the same as any other unplaced item — rather than blocking the delete.
     */
    @Transactional
    public void delete(UUID householdId, UUID categoryId, UUID requesterId) {
        assertMember(householdId, requesterId);
        GroceryCategory category = findCategory(householdId, categoryId);
        ingredientSectionRepository.deleteAll(ingredientSectionRepository.findByCategoryId(categoryId));
        repository.delete(category);
    }

    private GroceryCategory findCategory(UUID householdId, UUID categoryId) {
        GroceryCategory category = repository.findById(categoryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));
        if (!category.getHousehold().getId().equals(householdId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found");
        }
        return category;
    }

    private Household requireMember(UUID householdId, UUID requesterId) {
        assertMember(householdId, requesterId);
        return householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
    }

    private void assertMember(UUID householdId, UUID userId) {
        if (!memberRepository.existsByHouseholdIdAndUserId(householdId, userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not a member of this household");
        }
    }

    private static GroceryCategoryResponse toResponse(GroceryCategory category) {
        return new GroceryCategoryResponse(category.getId(), category.getName(), category.getPosition());
    }
}
