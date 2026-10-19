package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.receipts.ReceiptDtos;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public class GroceryListDtos {

    public record AddItemRequest(
            @Size(max = 200) String ingredientName,
            @PositiveOrZero BigDecimal quantity,
            @Size(max = 40) String unit) {
    }

    /**
     * "Done shopping". Everything in either list comes off the grocery list; only `putAway` goes
     * into the cupboard. The split is for the things you bought for someone else. A household
     * without a cupboard sends what it bought as `putAway` all the same: nothing is stocked, but
     * it is what starts those things' restock reminders over.
     */
    public record PutAwayRequest(List<UUID> putAway, List<UUID> leaveOut) {
    }

    public record MoveCategoryRequest(@NotNull UUID categoryId) {
    }

    /**
     * A recipe's ingredients straight onto the list, from its page. Everything may be left out:
     * `servings` defaults to the recipe's own, and its optional extras are only bought when named
     * in `includedOptionalIngredientIds` (recipe ingredient ids, as when planning it). `again:
     * true` adds it even though its things are still waiting on the list from last time — without
     * it, that is a 409 with `alreadyOnList: true`, so the app can ask first.
     */
    public record AddRecipeRequest(
            @Min(value = 1, message = "Buy for at least one person.") Integer servings,
            List<UUID> includedOptionalIngredientIds,
            Boolean again) {
    }

    /**
     * A price typed in on a grocery row: what was paid, for how much of it (one, each, when left
     * out), at which shop (found or made by name; blank for nowhere in particular), and whose make
     * it was ("Twinings"; blank for no brand in particular). Dated today.
     */
    public record SetPriceRequest(
            @NotNull(message = "Say what it cost.")
            @PositiveOrZero(message = "A price can't be below zero.")
            @DecimalMax(value = ReceiptDtos.MAX_MONEY, message = ReceiptDtos.TOO_BIG) BigDecimal price,
            @Positive(message = "A quantity has to be more than zero.")
            @DecimalMax(value = ReceiptDtos.MAX_QUANTITY, message = ReceiptDtos.TOO_MUCH) BigDecimal quantity,
            @Size(max = 20, message = "Keep the unit to 20 characters.") String unit,
            @Size(max = 80, message = "Keep the store's name to 80 characters.") String storeName,
            @Size(max = 60, message = "Keep the brand to 60 characters.") String brand) {
    }

    /** `left` is what Gemini could not place either — rare, and those can be moved by hand. */
    public record SortResponse(int sorted, int left) {
    }

    public record GroceryListItemResponse(
            UUID id,
            UUID householdId,
            UUID ingredientId,
            String name,
            BigDecimal quantity,
            String unit,
            boolean checked,
            UUID checkedByUserId,
            String checkedByName,
            Instant checkedAt,
            /** The category, for this household. Null means nobody has placed it yet. */
            UUID categoryId,
            /** False means neither the keyword list nor Gemini has placed it — Sort would. */
            boolean sorted,
            /**
             * The cupboard says you have this. Only meals and recipes put such things on the list.
             * Always false for a household that does not keep a cupboard.
             */
            boolean inCupboard,
            /**
             * The recipes it is here for, by name, each once: those of the planned meals that put
             * it here, and those added straight from their pages.
             */
            List<String> fromRecipes,
            /** Who typed it in or pressed Buy again. Null when only meals put it here. */
            String addedByName,
            /**
             * The newest price this household has for the thing — from a scanned receipt or typed
             * in — so the row can say "≈ $3.49". Null when it has none, and for a row with no
             * ingredient. Last, so a phone that predates it simply never reads it.
             */
            LastPrice lastPrice) implements Serializable {
    }

    /**
     * What was paid for something last time: `price` for `quantity` `unit` of it (one, each, when
     * those are null), of `brand` (null when nobody said whose), at `storeName` (null when nobody
     * said where), on `observedOn`, and whether it was on sale. `source` is RECEIPT or MANUAL. Serializable, because it rides along on the
     * live list updates.
     */
    public record LastPrice(
            BigDecimal price,
            BigDecimal quantity,
            String unit,
            String storeName,
            LocalDate observedOn,
            boolean onSale,
            String source,
            String brand) implements Serializable {
    }

    /**
     * Where one planned meal stands with the shopping, worked out without changing anything —
     * what the Plan shows as "On grocery list" or "Not on list", and what the add-the-week
     * sheet counts before you say yes.
     *
     * status is one of:
     *   ON_LIST         a recipe the list has already been brought up to (or a single item
     *                   waiting on the list, unticked)
     *   NOT_ON_LIST     a recipe the week's button would still add something for
     *   IN_CUPBOARD     nothing it needs is missing: everything is in the cupboard, or a staple
     *                   (never for a household that does not keep a cupboard)
     *   NO_INGREDIENTS  a recipe saved with just its name
     *   EAT_OUT         a place: nothing to buy
     *   LINK            a saved link: no ingredients to buy
     *   DELETED         a shared recipe or saved link that has since been deleted
     *
     * toAdd is what the week's button would add for it now, as the ingredients it would put on
     * the list (so a day's or a week's total can count garlic once). needs and inCupboard are the
     * meal's ingredients as its own "Add to groceries" counts them — "11 items, 3 already in
     * cupboard". Staples you always have are in neither.
     */
    public record PlannedShoppingResponse(
            UUID entryId,
            String status,
            List<UUID> toAdd,
            int needs,
            int inCupboard) {
    }
}
