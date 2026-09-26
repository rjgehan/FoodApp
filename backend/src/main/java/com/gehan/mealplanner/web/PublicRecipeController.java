package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.RecipeDtos.PublicRecipeResponse;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;
import com.gehan.mealplanner.dto.RecipeDtos.SaveSharedRecipeRequest;
import com.gehan.mealplanner.service.RecipeLinkService;
import com.gehan.mealplanner.service.RecipeService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * What a share link opens. Reading it is unauthenticated on purpose, and kept in its own
 * controller so the fact that it needs no token is impossible to miss when reading the code.
 * Only GETs under /api/public are open (SecurityConfig): saving a copy is a POST, so it needs
 * somebody signed in like everything else.
 */
@RestController
@RequestMapping("/api/public")
public class PublicRecipeController {

    private final RecipeLinkService linkService;
    private final RecipeService recipeService;

    public PublicRecipeController(RecipeLinkService linkService, RecipeService recipeService) {
        this.linkService = linkService;
        this.recipeService = recipeService;
    }

    @GetMapping("/recipes/{token}")
    public PublicRecipeResponse recipe(@PathVariable String token) {
        return linkService.view(token);
    }

    /** "Save to my recipes" on a share link: a copy of it, in one of the caller's households. */
    @PostMapping("/recipes/{token}/save")
    public ResponseEntity<RecipeResponse> save(@AuthenticationPrincipal UUID userId,
                                               @PathVariable String token,
                                               @Valid @RequestBody SaveSharedRecipeRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(recipeService.saveFromLink(token, request.householdId(), userId));
    }
}
