package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.GroceryListDtos.*;
import com.gehan.mealplanner.service.GroceryListService;
import jakarta.validation.Valid;
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
@RequestMapping("/api/households/{householdId}")
public class GroceryListController {

    private final GroceryListService groceryListService;

    public GroceryListController(GroceryListService groceryListService) {
        this.groceryListService = groceryListService;
    }

    @GetMapping("/grocery-list")
    public List<GroceryListItemResponse> list(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return groceryListService.listItems(householdId, userId);
    }

    @PostMapping("/grocery-list/items")
    public ResponseEntity<GroceryListItemResponse> addItem(@AuthenticationPrincipal UUID userId,
                                                             @PathVariable UUID householdId,
                                                             @RequestBody AddItemRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(groceryListService.addManualItem(householdId, userId, request));
    }

    /** Cross an item off (or back on); broadcasts live to every other household member watching. */
    @PatchMapping("/grocery-list/items/{itemId}")
    public GroceryListItemResponse setChecked(@AuthenticationPrincipal UUID userId,
                                               @PathVariable UUID householdId,
                                               @PathVariable UUID itemId,
                                               @RequestBody Map<String, Boolean> body) {
        boolean checked = Boolean.TRUE.equals(body.get("checked"));
        return groceryListService.setChecked(householdId, itemId, userId, checked);
    }

    @DeleteMapping("/grocery-list/items/{itemId}")
    public ResponseEntity<Void> removeItem(@AuthenticationPrincipal UUID userId,
                                            @PathVariable UUID householdId,
                                            @PathVariable UUID itemId) {
        groceryListService.removeItem(householdId, itemId, userId);
        return ResponseEntity.noContent().build();
    }

    /** "Done shopping" — clears the ticked items and stocks the cupboard with the ones for the house. */
    @PostMapping("/grocery-list/put-away")
    public ResponseEntity<Void> putAway(@AuthenticationPrincipal UUID userId,
                                         @PathVariable UUID householdId,
                                         @RequestBody PutAwayRequest request) {
        groceryListService.putAway(householdId, userId, request);
        return ResponseEntity.noContent().build();
    }

    /** Spends one Gemini request placing everything unplaced. See GroceryListService.sort. */
    @PostMapping("/grocery-list/sort")
    public SortResponse sort(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return groceryListService.sort(householdId, userId);
    }

    /** Adds one planned meal's ingredients to the list (skipping cupboard staples). */
    @PostMapping("/grocery-list/add-meal/{mealPlanEntryId}")
    public List<GroceryListItemResponse> addMeal(@AuthenticationPrincipal UUID userId,
                                                  @PathVariable UUID householdId,
                                                  @PathVariable UUID mealPlanEntryId) {
        return groceryListService.addMealToList(householdId, mealPlanEntryId, userId);
    }

    /** Adds everything planned in the date range (skipping cupboard staples). */
    @PostMapping("/grocery-list/add-all")
    public List<GroceryListItemResponse> addAll(@AuthenticationPrincipal UUID userId,
                                                 @PathVariable UUID householdId,
                                                 @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
                                                 @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end) {
        return groceryListService.addAllPlannedToList(householdId, userId, start, end);
    }

    /** Moves an ingredient to another aisle for this household — on the list and in the cupboard. */
    @PutMapping("/ingredients/{ingredientId}/section")
    public ResponseEntity<Void> moveToSection(@AuthenticationPrincipal UUID userId,
                                               @PathVariable UUID householdId,
                                               @PathVariable UUID ingredientId,
                                               @Valid @RequestBody MoveSectionRequest request) {
        groceryListService.moveToSection(householdId, ingredientId, userId, request.section());
        return ResponseEntity.noContent().build();
    }
}
