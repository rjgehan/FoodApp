package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.RecipeDtos.RecipeLinkResponse;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;
import com.gehan.mealplanner.dto.RecipeDtos.FilingRequest;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeCategoryResponse;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateImagesRequest;
import com.gehan.mealplanner.dto.RecipeDtos.ShareTargetResponse;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateSharesRequest;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateVideoRequest;
import com.gehan.mealplanner.service.RecipeLinkService;
import com.gehan.mealplanner.service.RecipeService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
public class RecipeController {

    private final RecipeService recipeService;

    private final RecipeLinkService linkService;

    public RecipeController(RecipeService recipeService, RecipeLinkService linkService) {
        this.linkService = linkService;
        this.recipeService = recipeService;
    }

    @PostMapping("/api/households/{householdId}/recipes")
    public ResponseEntity<RecipeResponse> create(@AuthenticationPrincipal UUID userId,
                                                  @PathVariable UUID householdId,
                                                  @Valid @RequestBody RecipeRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(recipeService.create(householdId, userId, request));
    }

    @GetMapping("/api/households/{householdId}/recipes")
    public List<RecipeResponse> list(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return recipeService.list(householdId, userId);
    }

    @GetMapping("/api/recipes/{recipeId}")
    public RecipeResponse get(@AuthenticationPrincipal UUID userId,
                               @PathVariable UUID recipeId,
                               @RequestParam(required = false) UUID householdId) {
        return recipeService.get(recipeId, householdId, userId);
    }

    @GetMapping("/api/recipes/{recipeId}/share-targets")
    public List<ShareTargetResponse> shareTargets(@AuthenticationPrincipal UUID userId,
                                                   @PathVariable UUID recipeId) {
        return recipeService.shareTargets(recipeId, userId);
    }

    @PutMapping("/api/recipes/{recipeId}/shares")
    public RecipeResponse updateShares(@AuthenticationPrincipal UUID userId,
                                        @PathVariable UUID recipeId,
                                        @Valid @RequestBody UpdateSharesRequest request) {
        return recipeService.updateShares(recipeId, userId, request);
    }

    /** Files (or re-files) a recipe into this household's catalog — including a shared one. */
    @PutMapping("/api/households/{householdId}/recipes/{recipeId}/filing")
    public RecipeResponse file(@AuthenticationPrincipal UUID userId,
                                @PathVariable UUID householdId,
                                @PathVariable UUID recipeId,
                                @Valid @RequestBody FilingRequest request) {
        return recipeService.file(householdId, recipeId, userId, request);
    }

    @GetMapping("/api/households/{householdId}/section-icons")
    public Map<RecipeSection, String> sectionIcons(@AuthenticationPrincipal UUID userId,
                                                    @PathVariable UUID householdId) {
        return recipeService.sectionIcons(householdId, userId);
    }

    @PutMapping("/api/households/{householdId}/section-icons/{section}")
    public Map<RecipeSection, String> setSectionIcon(@AuthenticationPrincipal UUID userId,
                                                      @PathVariable UUID householdId,
                                                      @PathVariable RecipeSection section,
                                                      @RequestBody Map<String, String> body) {
        return recipeService.setSectionIcon(householdId, userId, section, body.get("iconKey"));
    }

    @GetMapping("/api/households/{householdId}/recipe-categories")
    public List<RecipeCategoryResponse> listCategories(@AuthenticationPrincipal UUID userId,
                                                        @PathVariable UUID householdId) {
        return recipeService.listCategories(householdId, userId);
    }

    @DeleteMapping("/api/households/{householdId}/recipe-categories/{categoryId}")
    public ResponseEntity<Void> deleteCategory(@AuthenticationPrincipal UUID userId,
                                                @PathVariable UUID householdId,
                                                @PathVariable UUID categoryId) {
        recipeService.deleteCategory(householdId, categoryId, userId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/api/recipes/{recipeId}/video")
    public RecipeResponse updateVideo(@AuthenticationPrincipal UUID userId,
                                       @PathVariable UUID recipeId,
                                       @Valid @RequestBody UpdateVideoRequest request) {
        return recipeService.updateVideo(recipeId, userId, request);
    }

    @PutMapping("/api/recipes/{recipeId}/images")
    public RecipeResponse updateImages(@AuthenticationPrincipal UUID userId,
                                        @PathVariable UUID recipeId,
                                        @Valid @RequestBody UpdateImagesRequest request) {
        return recipeService.updateImages(recipeId, userId, request);
    }

    @PutMapping("/api/recipes/{recipeId}")
    public RecipeResponse update(@AuthenticationPrincipal UUID userId,
                                 @PathVariable UUID recipeId,
                                 @Valid @RequestBody RecipeRequest request) {
        return recipeService.update(recipeId, userId, request);
    }

    /** Creates the share link, or hands back the one that already exists. */
    @PostMapping("/api/recipes/{recipeId}/link")
    public RecipeLinkResponse createLink(@AuthenticationPrincipal UUID userId, @PathVariable UUID recipeId) {
        return new RecipeLinkResponse(linkService.createOrGet(recipeId, userId));
    }

    /** Null token means this recipe has no public link. */
    @GetMapping("/api/recipes/{recipeId}/link")
    public RecipeLinkResponse getLink(@AuthenticationPrincipal UUID userId, @PathVariable UUID recipeId) {
        return new RecipeLinkResponse(linkService.current(recipeId, userId).orElse(null));
    }

    @DeleteMapping("/api/recipes/{recipeId}/link")
    public ResponseEntity<Void> revokeLink(@AuthenticationPrincipal UUID userId, @PathVariable UUID recipeId) {
        linkService.revoke(recipeId, userId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/api/recipes/{recipeId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UUID userId, @PathVariable UUID recipeId) {
        recipeService.delete(recipeId, userId);
        return ResponseEntity.noContent().build();
    }
}
