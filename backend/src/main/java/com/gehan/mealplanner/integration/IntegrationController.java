package com.gehan.mealplanner.integration;

import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.integration.IntegrationDtos.*;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Read-only endpoints for other services on the home network. Nothing here writes, so a broken
 * dashboard can never damage the meal plan.
 */
@RestController
@RequestMapping("/api/integration")
public class IntegrationController {

    private final IntegrationService service;

    public IntegrationController(IntegrationService service) {
        this.service = service;
    }

    /** Start here: everything else needs a household id. */
    @GetMapping("/households")
    public List<HouseholdSummary> households() {
        return service.households();
    }

    /** What is planned today. The common case, so it has its own URL. */
    @GetMapping("/households/{householdId}/today")
    public DayResponse today(@PathVariable UUID householdId) {
        LocalDate today = LocalDate.now();
        return service.plan(householdId, today, today).get(0);
    }

    /**
     * A date range, defaulting to today plus the next six days. Days with nothing planned are
     * still returned, with no meals, so a week grid always has seven cells.
     */
    @GetMapping("/households/{householdId}/plan")
    public List<DayResponse> plan(
            @PathVariable UUID householdId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end,
            @RequestParam(required = false) Integer days) {

        LocalDate from = start != null ? start : LocalDate.now();
        LocalDate to = end != null ? end : from.plusDays(days != null ? Math.max(days, 1) - 1 : 6);
        return service.plan(householdId, from, to);
    }

    @GetMapping("/households/{householdId}/recipes")
    public List<RecipeSummary> recipes(
            @PathVariable UUID householdId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) RecipeSection section,
            @RequestParam(required = false) String category) {
        return service.recipes(householdId, q, section, category);
    }

    /**
     * householdId is optional and only affects how the recipe is filed — pass it to get the
     * section and categories as that household sees them.
     */
    @GetMapping("/recipes/{recipeId}")
    public RecipeDetail recipe(@PathVariable UUID recipeId,
                               @RequestParam(required = false) UUID householdId) {
        return service.recipe(recipeId, householdId);
    }

    @GetMapping("/households/{householdId}/grocery-list")
    public List<GroceryItem> groceries(@PathVariable UUID householdId) {
        return service.groceries(householdId);
    }

    @GetMapping("/households/{householdId}/places")
    public List<PlaceSummary> places(@PathVariable UUID householdId) {
        return service.places(householdId);
    }
}
