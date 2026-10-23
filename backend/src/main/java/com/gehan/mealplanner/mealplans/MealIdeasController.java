package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.mealplans.MealIdeasDtos.MealIdeasRequest;
import com.gehan.mealplanner.mealplans.MealIdeasDtos.MealIdeasResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Meal ideas: a few recipes the household's kitchen can make. Members of the household only.
 * Nothing is saved; a POST because what to leave out travels in the body.
 */
@RestController
public class MealIdeasController {

    private final MealIdeas mealIdeas;

    public MealIdeasController(MealIdeas mealIdeas) {
        this.mealIdeas = mealIdeas;
    }

    @PostMapping("/api/households/{householdId}/meal-ideas")
    public MealIdeasResponse ideas(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                   @Valid @RequestBody(required = false) MealIdeasRequest request) {
        return mealIdeas.ideas(householdId, userId, request != null ? request : new MealIdeasRequest(null, null, null));
    }
}
