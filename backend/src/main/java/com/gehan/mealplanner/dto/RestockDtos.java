package com.gehan.mealplanner.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public class RestockDtos {

    /** How often, in days. A year is as far as "remind me" means anything. */
    public record SetRestockRequest(@NotNull @Min(1) @Max(365) Integer everyDays) {
    }

    /**
     * The answer to "Time to restock?": `add` goes on the grocery list, `snooze` is not asked
     * about again for a few days. Either may be empty or left out.
     */
    public record AddDueRequest(List<UUID> add, List<UUID> snooze) {
    }

    /** "Not now" for these. */
    public record SnoozeRequest(List<UUID> ingredientIds) {
    }

    public record RestockReminderResponse(
            UUID ingredientId,
            String name,
            int everyDays,
            Instant lastBoughtAt,
            Instant dueAt,
            /** Null unless somebody said "not now" and that has not run out yet. */
            Instant snoozedUntil,
            /** Would be asked about right now: its time has come, not snoozed, not on the list. */
            boolean due) {
    }
}
