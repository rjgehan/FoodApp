package com.gehan.mealplanner.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public class CupboardDtos {

    /** Adding something already in the cupboard says you have it again — no longer running low. */
    public record AddCupboardItemRequest(@NotBlank @Size(max = 200) String name, Boolean staple) {
    }

    /**
     * All optional — send whichever is changing. A new name points the item at that ingredient,
     * the one the grocery list and recipes share; it never renames the ingredient itself.
     * `trackQuantity: true` switches the item to exact-amount tracking (send `quantity`/`unit`
     * alongside it); `trackQuantity: false` clears any quantity and reverts it to Have/Low.
     * Omitted, it leaves whichever mode the item is already in alone.
     *
     * `useBy` is "2026-10-08" to set the date on the packet, "" to clear it, and null (or left
     * out) to leave it alone — text rather than a date because JSON has no other way to tell
     * "clear it" from "not mentioned".
     */
    public record UpdateCupboardItemRequest(
            Boolean runningLow, Boolean staple, @Size(max = 200) String name,
            Boolean trackQuantity, @PositiveOrZero BigDecimal quantity, @Size(max = 40) String unit,
            @Pattern(regexp = "^$|^\\d{4}-\\d{2}-\\d{2}$", message = "useBy is a date like 2026-10-08, or empty to clear it")
            String useBy) {

        /** Everything from before use-by dates, which is what older phones still send. */
        public UpdateCupboardItemRequest(Boolean runningLow, Boolean staple, String name,
                                         Boolean trackQuantity, BigDecimal quantity, String unit) {
            this(runningLow, staple, name, trackQuantity, quantity, unit, null);
        }
    }

    /** How much to add (or, negative, remove) from an item already tracking an exact amount. */
    public record AdjustQuantityRequest(@NotNull BigDecimal delta) {
    }

    public record CupboardItemResponse(
            UUID id,
            UUID ingredientId,
            String name,
            boolean runningLow,
            boolean staple,
            UUID categoryId,
            /** False means neither the keyword list nor Gemini has placed it yet. */
            boolean sorted,
            /** Waiting on the grocery list, unticked. */
            boolean onList,
            /** Null means this item uses the simple Have/Low toggle instead. */
            BigDecimal quantity,
            String unit,
            /** The date on the packet, if somebody entered one. */
            LocalDate useBy,
            /** Wants using within a few days — by its date, or by the server's guess. */
            boolean useSoon,
            /** The soon is a guess from what it is and when it was bought, not a date. */
            boolean useSoonGuess,
            /** Words for a chip: "by Thu", "today", "past its date", "soon". Null when not soon and no date. */
            String useSoonLabel) {
    }

    /** One of the starter list's groups — "Baking", "Spices" — in the order to show them. */
    public record StarterGroup(String name, List<StarterItem> items) {
    }

    /** `have` means it is in this cupboard already, so there is nothing to add. */
    public record StarterItem(String name, boolean have) {
    }

    /** The names ticked, usually off the starter list, though any name is taken. */
    public record AddStartersRequest(@NotNull @Size(max = 200) List<@NotBlank @Size(max = 200) String> names) {
    }

    /** `skipped` were in the cupboard already, and are left exactly as they were. */
    public record AddStartersResponse(int added, int skipped) {
    }

    /** `skipped` were in this cupboard already, and are left exactly as they were. */
    public record CopyCupboardResponse(int copied, int skipped) {
    }
}
