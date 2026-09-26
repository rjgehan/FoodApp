package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.SavedLinkDtos.CreateSavedLinkRequest;
import com.gehan.mealplanner.dto.SavedLinkDtos.SavedLinkResponse;
import com.gehan.mealplanner.dto.SavedLinkDtos.UpdateSavedLinkRequest;
import com.gehan.mealplanner.service.SavedLinkService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/households/{householdId}/saved-links")
public class SavedLinkController {

    private final SavedLinkService savedLinkService;

    public SavedLinkController(SavedLinkService savedLinkService) {
        this.savedLinkService = savedLinkService;
    }

    /** The household's links and your own "just me" ones, newest first. */
    @GetMapping
    public List<SavedLinkResponse> list(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return savedLinkService.list(householdId, userId);
    }

    /** 201 for a new one; 200 when the link was already saved and that one was updated instead. */
    @PostMapping
    public ResponseEntity<SavedLinkResponse> create(@AuthenticationPrincipal UUID userId,
                                                    @PathVariable UUID householdId,
                                                    @Valid @RequestBody CreateSavedLinkRequest request) {
        SavedLinkResponse saved = savedLinkService.create(householdId, userId, request);
        return ResponseEntity.status(saved.alreadySaved() ? HttpStatus.OK : HttpStatus.CREATED).body(saved);
    }

    @PatchMapping("/{linkId}")
    public SavedLinkResponse update(@AuthenticationPrincipal UUID userId,
                                    @PathVariable UUID householdId,
                                    @PathVariable UUID linkId,
                                    @Valid @RequestBody UpdateSavedLinkRequest request) {
        return savedLinkService.update(householdId, linkId, userId, request);
    }

    @DeleteMapping("/{linkId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UUID userId,
                                       @PathVariable UUID householdId,
                                       @PathVariable UUID linkId) {
        savedLinkService.delete(householdId, linkId, userId);
        return ResponseEntity.noContent().build();
    }
}
