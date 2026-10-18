package com.gehan.mealplanner.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
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
            String addedByName) implements Serializable {
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
