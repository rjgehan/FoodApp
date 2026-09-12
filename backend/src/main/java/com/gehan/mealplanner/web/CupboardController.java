package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.CupboardDtos.AddCupboardItemRequest;
import com.gehan.mealplanner.dto.CupboardDtos.CupboardItemResponse;
import com.gehan.mealplanner.dto.CupboardDtos.UpdateCupboardItemRequest;
import com.gehan.mealplanner.service.CupboardService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/households/{householdId}/cupboard")
public class CupboardController {

    private final CupboardService cupboardService;

    public CupboardController(CupboardService cupboardService) {
        this.cupboardService = cupboardService;
    }

    @GetMapping
    public List<CupboardItemResponse> list(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return cupboardService.list(householdId, userId);
    }

    @PostMapping
    public ResponseEntity<CupboardItemResponse> add(@AuthenticationPrincipal UUID userId,
                                                     @PathVariable UUID householdId,
                                                     @Valid @RequestBody AddCupboardItemRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(cupboardService.add(householdId, userId, request));
    }

    @PatchMapping("/{itemId}")
    public CupboardItemResponse update(@AuthenticationPrincipal UUID userId,
                                       @PathVariable UUID householdId,
                                       @PathVariable UUID itemId,
                                       @RequestBody UpdateCupboardItemRequest request) {
        return cupboardService.update(householdId, itemId, userId, request);
    }

    /** Used up and wanted again — off the cupboard, onto the grocery list. */
    @PostMapping("/{itemId}/buy-again")
    public ResponseEntity<Void> buyAgain(@AuthenticationPrincipal UUID userId,
                                          @PathVariable UUID householdId,
                                          @PathVariable UUID itemId) {
        cupboardService.buyAgain(householdId, itemId, userId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{itemId}")
    public ResponseEntity<Void> remove(@AuthenticationPrincipal UUID userId,
                                        @PathVariable UUID householdId,
                                        @PathVariable UUID itemId) {
        cupboardService.remove(householdId, itemId, userId);
        return ResponseEntity.noContent().build();
    }
}
