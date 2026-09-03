package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.domain.RecipeLink;
import com.gehan.mealplanner.domain.StoredImage;
import com.gehan.mealplanner.dto.RecipeDtos.PublicIngredientResponse;
import com.gehan.mealplanner.dto.RecipeDtos.PublicRecipeResponse;
import com.gehan.mealplanner.repository.RecipeLinkRepository;
import com.gehan.mealplanner.repository.RecipeRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Public share links. Everything here is deliberately narrow: a link resolves to exactly one
 * recipe and reveals nothing about the household that owns it.
 */
@Service
public class RecipeLinkService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    /** 32 bytes. Guessing one is not a thing that happens. */
    private static final int TOKEN_BYTES = 32;

    private final RecipeLinkRepository linkRepository;
    private final RecipeRepository recipeRepository;
    private final HouseholdService householdService;

    public RecipeLinkService(RecipeLinkRepository linkRepository,
                             RecipeRepository recipeRepository,
                             HouseholdService householdService) {
        this.linkRepository = linkRepository;
        this.recipeRepository = recipeRepository;
        this.householdService = householdService;
    }

    /**
     * Returns the existing link or makes one. Reusing it means sharing the same recipe twice
     * does not scatter a trail of separate live URLs that all have to be revoked one by one.
     */
    @Transactional
    public String createOrGet(UUID recipeId, UUID requesterId) {
        Recipe recipe = ownedRecipe(recipeId, requesterId);
        return linkRepository.findByRecipeId(recipeId)
                .map(RecipeLink::getToken)
                .orElseGet(() -> linkRepository.save(RecipeLink.builder()
                        .token(ENCODER.encodeToString(randomBytes()))
                        .recipe(recipe)
                        .createdAt(Instant.now())
                        .build()).getToken());
    }

    /** The current link, or empty when the recipe has never been shared this way. */
    @Transactional(readOnly = true)
    public Optional<String> current(UUID recipeId, UUID requesterId) {
        ownedRecipe(recipeId, requesterId);
        return linkRepository.findByRecipeId(recipeId).map(RecipeLink::getToken);
    }

    /** Kills the link. Anyone still holding the URL gets a 404 from that moment on. */
    @Transactional
    public void revoke(UUID recipeId, UUID requesterId) {
        ownedRecipe(recipeId, requesterId);
        linkRepository.deleteByRecipeId(recipeId);
    }

    /**
     * The only unauthenticated read in the app besides image bytes. Everything household-shaped
     * — who owns it, who else it is shared with, how it is filed — is left out on purpose.
     */
    @Transactional(readOnly = true)
    public PublicRecipeResponse view(String token) {
        RecipeLink link = linkRepository.findByToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "That link isn't valid."));
        Recipe recipe = link.getRecipe();

        // Materialized inside the transaction: Jackson serializes long after it has closed.
        List<PublicIngredientResponse> ingredients = recipe.getIngredients().stream()
                .map(i -> new PublicIngredientResponse(
                        i.getIngredient().getName(), i.getQuantity(), i.getUnit(), i.getNotes()))
                .toList();
        List<UUID> photoIds = recipe.getPhotos().stream().map(StoredImage::getId).toList();

        return new PublicRecipeResponse(
                recipe.getName(), recipe.getDescription(), recipe.getInstructions(),
                recipe.getPrepTimeMinutes(), recipe.getCookTimeMinutes(), recipe.getServings(),
                recipe.getSourceUrl(), recipe.getVideoUrl(),
                recipe.getCoverImage() == null ? null : recipe.getCoverImage().getId(),
                photoIds, ingredients);
    }

    /** Only the household that owns a recipe can hand out or withdraw a link to it. */
    private Recipe ownedRecipe(UUID recipeId, UUID requesterId) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        householdService.assertMember(recipe.getHousehold().getId(), requesterId);
        return recipe;
    }

    private static byte[] randomBytes() {
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        return bytes;
    }
}
