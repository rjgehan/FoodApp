package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.mealplans.CupboardPlanDtos.ApplyRequest;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.ApplyResponse;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.CupboardPlanRequest;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.CupboardPlanResponse;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.CupboardSetupResponse;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.CupboardSwapRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Meal plans (Explore, mockup 5.7–5.11): one generated from what is in the cupboard, and putting
 * any generated meals on the household's Plan. Members of the household only, like its Plan.
 */
@RestController
@RequestMapping("/api/households/{householdId}/meal-plans")
public class MealPlansController {

    private final CupboardPlans cupboardPlans;
    private final PlanApply apply;

    public MealPlansController(CupboardPlans cupboardPlans, PlanApply apply) {
        this.cupboardPlans = cupboardPlans;
        this.apply = apply;
    }

    /** What the cupboard setup starts from; also the teaser on Meal plans and Explore. */
    @GetMapping("/cupboard")
    public CupboardSetupResponse cupboardSetup(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return cupboardPlans.setup(householdId, userId);
    }

    /** A draft — nothing is saved until it is applied. */
    @PostMapping("/cupboard")
    public CupboardPlanResponse cupboardPlan(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                             @Valid @RequestBody CupboardPlanRequest request) {
        return cupboardPlans.generate(householdId, userId, request);
    }

    @PostMapping("/cupboard/swap")
    public CupboardPlanResponse cupboardSwap(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                             @Valid @RequestBody CupboardSwapRequest request) {
        return cupboardPlans.swap(householdId, userId, request);
    }

    /** Puts meals on the Plan (never over one already there) and, optionally, things on the grocery list. */
    @PostMapping("/apply")
    public ApplyResponse apply(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                               @Valid @RequestBody ApplyRequest request) {
        return apply.apply(householdId, userId, request.meals(), request.addToGroceries());
    }
}
