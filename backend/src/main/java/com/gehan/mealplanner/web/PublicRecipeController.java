package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.RecipeDtos.PublicRecipeResponse;
import com.gehan.mealplanner.service.RecipeLinkService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Unauthenticated on purpose — this is what a share link opens. Kept in its own controller so
 * the fact that it needs no token is impossible to miss when reading the code.
 */
@RestController
@RequestMapping("/api/public")
public class PublicRecipeController {

    private final RecipeLinkService linkService;

    public PublicRecipeController(RecipeLinkService linkService) {
        this.linkService = linkService;
    }

    @GetMapping("/recipes/{token}")
    public PublicRecipeResponse recipe(@PathVariable String token) {
        return linkService.view(token);
    }
}
