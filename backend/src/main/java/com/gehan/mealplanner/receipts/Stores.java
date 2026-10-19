package com.gehan.mealplanner.receipts;

import com.gehan.mealplanner.domain.Household;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * A household's shops, found or made by the name a receipt or a typed price gives. Callers hold
 * the household's lock (as everything that writes its list or receipts does), so two saves naming
 * a new shop at the same moment make it once: the second finds the first's. The unique index on
 * lower(name) is the backstop, not the plan.
 */
@Component
public class Stores {

    private final StoreRepository storeRepository;

    public Stores(StoreRepository storeRepository) {
        this.storeRepository = storeRepository;
    }

    /** Null for no name: a price from nowhere in particular is still a price. */
    public Store findOrCreate(Household household, String name) {
        String tidy = tidy(name);
        if (tidy == null) {
            return null;
        }
        return storeRepository.findByName(household.getId(), tidy)
                .orElseGet(() -> storeRepository.save(Store.builder().household(household).name(tidy).build()));
    }

    public Store find(UUID householdId, String name) {
        String tidy = tidy(name);
        return tidy == null ? null : storeRepository.findByName(householdId, tidy).orElse(null);
    }

    /** "  Kings   Food Markets " is "Kings Food Markets"; blank is no name at all. */
    static String tidy(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        return name.trim().replaceAll("\s+", " ");
    }
}
