package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.BlacklistDtos.AddBlacklistRequest;
import com.gehan.mealplanner.dto.BlacklistDtos.BlacklistEntryResponse;
import com.gehan.mealplanner.service.GroceryListService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/households/{householdId}/blacklist")
public class BlacklistController {

    private final GroceryListService groceryListService;

    public BlacklistController(GroceryListService groceryListService) {
        this.groceryListService = groceryListService;
    }

    @GetMapping
    public List<BlacklistEntryResponse> list(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return groceryListService.listBlacklist(householdId, userId);
    }

    @PostMapping
    public ResponseEntity<BlacklistEntryResponse> add(@AuthenticationPrincipal UUID userId,
                                                        @PathVariable UUID householdId,
                                                        @Valid @RequestBody AddBlacklistRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(groceryListService.addToBlacklist(householdId, userId, request));
    }

    @DeleteMapping("/{ingredientId}")
    public ResponseEntity<Void> remove(@AuthenticationPrincipal UUID userId,
                                        @PathVariable UUID householdId,
                                        @PathVariable UUID ingredientId) {
        groceryListService.removeFromBlacklist(householdId, ingredientId, userId);
        return ResponseEntity.noContent().build();
    }
}
