package com.gehan.mealplanner.dto;

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
     * into the cupboard. The split is for the things you bought for someone else.
     */
    public record PutAwayRequest(List<UUID> putAway, List<UUID> leaveOut) {
    }

    public record MoveCategoryRequest(@NotNull UUID categoryId) {
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
            /** The cupboard says you have this. Only meals put such things on the list. */
            boolean inCupboard) implements Serializable {
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
