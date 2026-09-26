package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.service.SourceLinks;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public class RecipeDtos {

    public record RecipeIngredientRequest(
            @NotBlank @Size(max = 200) String ingredientName,
            /** Null for no amount — "salt and pepper" — which the app shows and shops as "some". */
            @PositiveOrZero BigDecimal quantity,
            @Size(max = 40) String unit,
            String notes,
            /**
             * Something a cook might skip — chosen per occasion when the recipe is planned. A
             * Boolean so that leaving it out means "no": a phone still running the app from before
             * this field existed must still be able to save a recipe.
             */
            Boolean optional) {
    }

    /**
     * One of a recipe's links, both ways: what the form sends and what comes back. A null label
     * means the app names it after the site — "TikTok", "bbcgoodfood.com". A blank url is an
     * empty row somebody left in the form, and is dropped rather than refused.
     *
     * No size checks here: they would run before the label is trimmed and blank rows dropped,
     * and answer "size must be between 0 and 60". SourceLinks.clean checks the cleaned values
     * and says so in a sentence.
     */
    public record SourceLink(String url, String label) {
    }

    /** Ingredient quantities are for the given servings count, as written — not normalized to 1 person. */
    public record RecipeRequest(
            @NotBlank @Size(max = 200) String name,
            String description,
            String instructions,
            Integer prepTimeMinutes,
            Integer cookTimeMinutes,
            @NotNull @Min(1) Integer servings,
            /**
             * The old single links, from phones that predate `links`. Only ever added to the
             * list — leaving them out, as every client always has, changes nothing.
             */
            String sourceUrl,
            String videoUrl,
            /**
             * Every link, in order, replacing what the recipe had. Null — a client that has never
             * heard of links — leaves them exactly as they are.
             */
            @Size(max = SourceLinks.MAX_ROWS_SENT) List<SourceLink> links,
            RecipeSection section,
            List<String> categories,
            UUID coverImageId,
            List<UUID> photoIds,
            /**
             * May be empty: from the meal planner you can save just a name and fill the rest in
             * later. Such a recipe adds nothing to the grocery list, and the planner says so.
             */
            @NotNull @Valid List<RecipeIngredientRequest> ingredients) {
    }

    /** A link to a recipe on the web, to be read from the page's own structured data. */
    public record ImportRecipeRequest(@NotBlank String url) {
    }

    /** A blank or null url removes the video link; anything else takes its place, or is added. */
    public record UpdateVideoRequest(String videoUrl) {
    }

    /** The whole list of links, in order. An empty list removes them all. */
    public record UpdateLinksRequest(@NotNull @Size(max = SourceLinks.MAX_ROWS_SENT) List<SourceLink> links) {
    }

    /** Sets the cover picture and the photo strip on a recipe the household owns. */
    public record UpdateImagesRequest(UUID coverImageId, List<UUID> photoIds) {
    }

    /**
     * Files a recipe into one household's catalog. Works for a recipe another household shared
     * with you — that is how it moves out of "Shared". Category names that do not exist yet are
     * created in the household on the spot, which is how new categories come into being at all.
     */
    public record FilingRequest(
            RecipeSection section,
            List<String> categories) {
    }

    /** What a guest with a link gets back: the recipe, and deliberately nothing else. */
    public record PublicRecipeResponse(
            String name,
            String description,
            String instructions,
            Integer prepTimeMinutes,
            Integer cookTimeMinutes,
            int servings,
            String sourceUrl,
            String videoUrl,
            List<SourceLink> links,
            UUID coverImageId,
            List<UUID> photoIds,
            List<PublicIngredientResponse> ingredients) {
    }

    public record PublicIngredientResponse(
            String ingredientName, BigDecimal quantity, String unit, String notes, boolean optional) {
    }

    /** The share link for a recipe. A null token means no link exists yet. */
    public record RecipeLinkResponse(String token) {
    }

    public record RecipeIngredientResponse(
            UUID id, String ingredientName, BigDecimal quantity, String unit, String notes, boolean optional) {
    }

    public record RecipeResponse(
            UUID id,
            UUID householdId,
            String name,
            String description,
            String instructions,
            Integer prepTimeMinutes,
            Integer cookTimeMinutes,
            int servings,
            /** The first link that is not a video. For clients that predate `links`. */
            String sourceUrl,
            /** The first video link. For clients that predate `links`. */
            String videoUrl,
            List<SourceLink> links,
            /** Where this household filed it. Null means unfiled, which the UI shows as "Shared". */
            RecipeSection section,
            List<String> categories,
            /** True when another household owns it — you can file it, but not edit it. */
            boolean shared,
            /** The household that owns it, for a recipe that came from somewhere else. */
            String ownerName,
            /** In Explore, where every signed-in household can read it. Only the owner can change it. */
            boolean published,
            /** Households this recipe is shared with. Only meaningful to the owner. */
            List<UUID> sharedWith,
            UUID coverImageId,
            List<UUID> photoIds,
            List<RecipeIngredientResponse> ingredients) {
    }

    /** `parentId` is the group this one sits inside; null at the top of a drawer. */
    /** `section` is the drawer the group belongs to; null means it shows in every drawer. */
    /** `iconKey` is the food drawing its tile wears (FoodIcons); null for a plain tile. */
    public record RecipeCategoryResponse(UUID id, String name, int recipeCount, UUID parentId, RecipeSection section,
                                         String iconKey) {
    }

    /** A new group, optionally inside another. Names are unique within a household. */
    /** `section` is ignored when `parentId` is given — a nested group joins its parent's drawer. */
    /** `iconKey` is optional; a key that is not one of FoodIcons is refused. */
    public record CreateCategoryRequest(@NotBlank String name, UUID parentId, RecipeSection section, String iconKey) {
    }

    /**
     * Rename, move, re-icon, or any of them. A null parentId leaves it where it is — JSON cannot
     * tell "no change" from "no parent" — so moving a group out to the top level is `toTop: true`.
     * The icon follows the same rule: null leaves it, which is what an app from before icons
     * sends, and an empty string takes it off.
     */
    public record UpdateCategoryRequest(String name, UUID parentId, Boolean toTop, String iconKey) {
    }

    /** Files these recipes into a group, taking them out of `fromCategoryId` if they were in it. */
    public record MoveRecipesRequest(@NotNull List<UUID> recipeIds, UUID fromCategoryId) {
    }

    public record PublishRequest(boolean published) {
    }

    /**
     * Which of your own households this recipe is shared with. One of yours left out is
     * unshared; a share into a household you are not in is left alone whether it is listed or not.
     */
    public record UpdateSharesRequest(List<UUID> householdIds) {
    }

    /** Where to keep a copy of a recipe opened from a public link: one of your households. */
    public record SaveSharedRecipeRequest(@NotNull UUID householdId) {
    }

    /** A household you could share with, and whether this recipe already is. */
    public record ShareTargetResponse(UUID householdId, String name, boolean shared) {
    }
}
