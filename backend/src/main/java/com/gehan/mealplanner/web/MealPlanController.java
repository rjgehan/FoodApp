package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.MealPlanDtos.MealPlanEntryResponse;
import com.gehan.mealplanner.dto.MealPlanDtos.UpsertMealPlanEntryRequest;
import com.gehan.mealplanner.service.MealPlanService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/households/{householdId}/meal-plan")
public class MealPlanController {

    private final MealPlanService mealPlanService;

    public MealPlanController(MealPlanService mealPlanService) {
        this.mealPlanService = mealPlanService;
    }

    @GetMapping
    public List<MealPlanEntryResponse> listRange(@AuthenticationPrincipal UUID userId,
                                                  @PathVariable UUID householdId,
                                                  @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
                                                  @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end) {
        return mealPlanService.listRange(householdId, userId, start, end);
    }

    /** Assigns a meal to a date+mealType slot, or substitutes what's already planned there. */
    @PutMapping
    public MealPlanEntryResponse upsert(@AuthenticationPrincipal UUID userId,
                                         @PathVariable UUID householdId,
                                         @Valid @RequestBody UpsertMealPlanEntryRequest request) {
        return mealPlanService.upsert(householdId, userId, request);
    }

    @DeleteMapping("/{entryId}")
    public void delete(@AuthenticationPrincipal UUID userId, @PathVariable UUID entryId) {
        mealPlanService.delete(entryId, userId);
    }
}
