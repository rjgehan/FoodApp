package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.repository.RestockReminderRepository;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

/**
 * The time every restock reminder runs on, and the one thing that starts it over: buying the
 * thing. Apart from {@link RestockService} because the grocery list and the cupboard are where
 * buying happens, and the restock service in turn adds to the grocery list — each needing the
 * other would be a loop.
 */
@Component
public class RestockClock {

    private final RestockReminderRepository reminderRepository;
    private Clock clock = Clock.systemUTC();

    public RestockClock(RestockReminderRepository reminderRepository) {
        this.reminderRepository = reminderRepository;
    }

    public Instant now() {
        return clock.instant();
    }

    /** For tests, which cannot wait three weeks to see whether something comes due. */
    void use(Clock clock) {
        this.clock = clock;
    }

    /** Bought — put away through Done shopping, or added to the cupboard by hand. */
    public void bought(UUID householdId, UUID ingredientId) {
        reminderRepository.findByHouseholdIdAndIngredientId(householdId, ingredientId)
                .ifPresent(reminder -> reminder.bought(now()));
    }

    /**
     * A cupboard item renamed into another ingredient — "eggs" made "large eggs". Its reminder
     * goes with it, since it was about the thing on the shelf and not the word. If the new name
     * has one of its own already, that one is the one kept: the rename says the two are one
     * thing now, and one thing is asked about once.
     */
    public void moved(UUID householdId, UUID fromIngredientId, Ingredient to) {
        reminderRepository.findByHouseholdIdAndIngredientId(householdId, fromIngredientId).ifPresent(reminder -> {
            if (reminderRepository.findByHouseholdIdAndIngredientId(householdId, to.getId()).isPresent()) {
                reminderRepository.delete(reminder);
            } else {
                reminder.setIngredient(to);
                reminderRepository.save(reminder);
            }
        });
    }
}
