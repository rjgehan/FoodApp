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
import java.time.Instant;
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
            @NotNull @Valid List<RecipeIngredientRequest> ingredients,
            /**
             * On a new recipe: the saved link it was made from. That link has done its job and
             * is deleted, and meals planned with it get this recipe instead. Ignored on an edit.
             */
            UUID savedLinkId,
            /**
             * The kitchen machines it needs, as KitchenMachines keys, when the person picked them.
             * Null — every client from before machines, and a form nobody touched them on — leaves
             * them to ApplianceDetector, which reads them from the method on each save. A list is
             * the person's say: on an edit it is exactly what the recipe needs from then on, and
             * the detector leaves it alone; on a new recipe the detector adds what the method
             * mentions to what they picked.
             */
            List<String> appliances) {

        /** A recipe whose machines are left to the detector. */
        public RecipeRequest(String name, String description, String instructions, Integer prepTimeMinutes,
                Integer cookTimeMinutes, Integer servings, String sourceUrl, String videoUrl,
                List<SourceLink> links, RecipeSection section, List<String> categories, UUID coverImageId,
                List<UUID> photoIds, List<RecipeIngredientRequest> ingredients, UUID savedLinkId) {
            this(name, description, instructions, prepTimeMinutes, cookTimeMinutes, servings, sourceUrl, videoUrl,
                    links, section, categories, coverImageId, photoIds, ingredients, savedLinkId, null);
        }

        /** A recipe that did not come from a saved link — which is every recipe from before them. */
        public RecipeRequest(String name, String description, String instructions, Integer prepTimeMinutes,
                Integer cookTimeMinutes, Integer servings, String sourceUrl, String videoUrl,
                List<SourceLink> links, RecipeSection section, List<String> categories, UUID coverImageId,
                List<UUID> photoIds, List<RecipeIngredientRequest> ingredients) {
            this(name, description, instructions, prepTimeMinutes, cookTimeMinutes, servings, sourceUrl, videoUrl,
                    links, section, categories, coverImageId, photoIds, ingredients, null, null);
        }
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
     * with you — that is how it moves out of "Shared". `categories` are tag names, looked up in
     * that drawer only; one the drawer does not have yet is made there on the spot, which is how
     * a tag typed into the recipe form comes into being.
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
            List<PublicIngredientResponse> ingredients,
            /** The kitchen machines it needs, as KitchenMachines keys, in the catalogue's order. */
            List<String> appliances) {
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
            /** The names of the tags this household gave it, all from that drawer, sorted. */
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
            List<RecipeIngredientResponse> ingredients,
            /** On a recipe another household shared with you: the drawer it is in over there. */
            RecipeSection ownerSection,
            /** On a recipe another household shared with you: when they shared it, if known. */
            Instant sharedAt,
            /**
             * The kitchen machines it needs, as KitchenMachines keys, in the catalogue's order —
             * read from the method, or picked by hand. The method alone never gives the stovetop,
             * which nearly everything uses; somebody can still pick it.
             */
            List<String> appliances) {
    }

    /**
     * A tag. `recipeCount` is how many of the household's recipes wear it. `parentId` is always
     * null now that tags are flat — kept because every phone already installed reads it. `section`
     * is the drawer it belongs to, never null. `iconKey` is the food drawing its chip wears
     * (FoodIcons); null for a plain one.
     */
    public record RecipeCategoryResponse(UUID id, String name, int recipeCount, UUID parentId, RecipeSection section,
                                         String iconKey) {
    }

    /**
     * A new tag in one drawer. Names are unique within a drawer, ignoring case.
     *
     * `section` is the drawer. A phone from before tags sends none when it splits a group up —
     * only `parentId`, the group it came out of — so that group's drawer is the one meant; with
     * neither, there is nowhere to put it. `parentId` means nothing else any more.
     *
     * `iconKey` is optional; a key that is not one of FoodIcons is refused. `recipeIds` tags those
     * recipes in the same request — "these four look like Chicken" is one tap — skipping any this
     * household has not filed in that drawer.
     */
    public record CreateCategoryRequest(@NotBlank String name, UUID parentId, RecipeSection section, String iconKey,
                                        List<UUID> recipeIds) {

        /** A tag made on its own, which is how every app made one before `recipeIds`. */
        public CreateCategoryRequest(String name, UUID parentId, RecipeSection section, String iconKey) {
            this(name, parentId, section, iconKey, null);
        }
    }

    /**
     * Rename, re-icon, or both. Null leaves either as it is; an empty icon takes it off, and a
     * null one is what an app from before icons sends. A phone from before tags may also send
     * `parentId` or `toTop` to move a group inside another — tags do not nest, so those are not
     * read at all.
     */
    public record UpdateCategoryRequest(String name, String iconKey) {
    }

    /**
     * Tags these recipes, from a phone from before tags — its "move into this group". That also
     * sent `fromCategoryId`, the group they came out of, to untag them there; it is not read, so
     * an old phone splitting Main up adds the new tag and leaves Main on, as it now is for every
     * recipe that was ever inside it.
     */
    public record MoveRecipesRequest(@NotNull List<UUID> recipeIds) {
    }

    /**
     * Tags and untags recipes in one go — a selection in a drawer, or the recipes picked for a
     * new tag. Either list may be left out. Recipes this household has not filed in the tag's
     * drawer are skipped, not refused.
     */
    public record TagRecipesRequest(List<UUID> add, List<UUID> remove) {
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
