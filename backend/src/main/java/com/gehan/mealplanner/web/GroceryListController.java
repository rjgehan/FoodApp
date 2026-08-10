package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.GroceryListDtos.*;
import com.gehan.mealplanner.service.GroceryListService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/households/{householdId}/grocery-list")
public class GroceryListController {

    private final GroceryListService groceryListService;

    public GroceryListController(GroceryListService groceryListService) {
        this.groceryListService = groceryListService;
    }

    @GetMapping
    public List<GroceryListItemResponse> list(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return groceryListService.listItems(householdId, userId);
    }

    @PostMapping("/items")
    public ResponseEntity<GroceryListItemResponse> addItem(@AuthenticationPrincipal UUID userId,
                                                             @PathVariable UUID householdId,
                                                             @RequestBody AddItemRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(groceryListService.addManualItem(householdId, userId, request));
    }

    /** Cross an item off (or back on); broadcasts live to every other household member watching. */
    @PatchMapping("/items/{itemId}")
    public GroceryListItemResponse setChecked(@AuthenticationPrincipal UUID userId,
                                               @PathVariable UUID householdId,
                                               @PathVariable UUID itemId,
                                               @RequestBody Map<String, Boolean> body) {
        boolean checked = Boolean.TRUE.equals(body.get("checked"));
        return groceryListService.setChecked(householdId, itemId, userId, checked);
    }

    @DeleteMapping("/items/{itemId}")
    public ResponseEntity<Void> removeItem(@AuthenticationPrincipal UUID userId,
                                            @PathVariable UUID householdId,
                                            @PathVariable UUID itemId) {
        groceryListService.removeItem(householdId, itemId, userId);
        return ResponseEntity.noContent().build();
    }

    /** Adds one planned meal's recipe ingredients to the list (skipping anything blacklisted). */
    @PostMapping("/add-meal/{mealPlanEntryId}")
    public List<GroceryListItemResponse> addMeal(@AuthenticationPrincipal UUID userId,
                                                  @PathVariable UUID householdId,
                                                  @PathVariable UUID mealPlanEntryId) {
        return groceryListService.addMealToList(householdId, mealPlanEntryId, userId);
    }

    /** Adds ingredients from every planned meal in the date range (skipping anything blacklisted). */
    @PostMapping("/add-all")
    public List<GroceryListItemResponse> addAll(@AuthenticationPrincipal UUID userId,
                                                 @PathVariable UUID householdId,
                                                 @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
                                                 @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end) {
        return groceryListService.addAllPlannedToList(householdId, userId, start, end);
    }
}
