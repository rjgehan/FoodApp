package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.GroceryListDtos.GroceryListItemResponse;
import com.gehan.mealplanner.dto.RestockDtos.AddDueRequest;
import com.gehan.mealplanner.dto.RestockDtos.RestockReminderResponse;
import com.gehan.mealplanner.dto.RestockDtos.SetRestockRequest;
import com.gehan.mealplanner.dto.RestockDtos.SnoozeRequest;
import com.gehan.mealplanner.service.RestockService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** "Remind me to buy this every 3 weeks", and the question the app asks when one comes due. */
@RestController
@RequestMapping("/api/households/{householdId}/restock")
public class RestockController {

    private final RestockService restockService;

    public RestockController(RestockService restockService) {
        this.restockService = restockService;
    }

    @GetMapping
    public List<RestockReminderResponse> list(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return restockService.list(householdId, userId);
    }

    /** What to ask "Time to restock?" about right now. Usually nothing. */
    @GetMapping("/due")
    public List<RestockReminderResponse> due(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return restockService.due(householdId, userId);
    }

    @PutMapping("/{ingredientId}")
    public RestockReminderResponse set(@AuthenticationPrincipal UUID userId,
                                       @PathVariable UUID householdId,
                                       @PathVariable UUID ingredientId,
                                       @Valid @RequestBody SetRestockRequest request) {
        return restockService.set(householdId, ingredientId, userId, request.everyDays());
    }

    @DeleteMapping("/{ingredientId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UUID userId,
                                       @PathVariable UUID householdId,
                                       @PathVariable UUID ingredientId) {
        restockService.delete(householdId, ingredientId, userId);
        return ResponseEntity.noContent().build();
    }

    /** "Add to list": the ticked ones onto the grocery list, the rest left for a few days. */
    @PostMapping("/add-due")
    public List<GroceryListItemResponse> addDue(@AuthenticationPrincipal UUID userId,
                                                @PathVariable UUID householdId,
                                                @RequestBody AddDueRequest request) {
        return restockService.addDue(householdId, userId, request);
    }

    /** "Not now". */
    @PostMapping("/snooze")
    public ResponseEntity<Void> snooze(@AuthenticationPrincipal UUID userId,
                                       @PathVariable UUID householdId,
                                       @RequestBody SnoozeRequest request) {
        restockService.snooze(householdId, userId, request.ingredientIds());
        return ResponseEntity.noContent().build();
    }
}
