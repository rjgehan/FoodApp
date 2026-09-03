package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.PlaceDtos.PlaceRequest;
import com.gehan.mealplanner.dto.PlaceDtos.PlaceResponse;
import com.gehan.mealplanner.service.PlaceService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
public class PlaceController {

    private final PlaceService placeService;

    public PlaceController(PlaceService placeService) {
        this.placeService = placeService;
    }

    @GetMapping("/api/households/{householdId}/places")
    public List<PlaceResponse> list(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return placeService.list(householdId, userId);
    }

    @PostMapping("/api/households/{householdId}/places")
    public PlaceResponse create(@AuthenticationPrincipal UUID userId,
                                @PathVariable UUID householdId,
                                @Valid @RequestBody PlaceRequest request) {
        return placeService.createOrGet(householdId, userId, request);
    }

    @PutMapping("/api/places/{placeId}")
    public PlaceResponse update(@AuthenticationPrincipal UUID userId,
                                @PathVariable UUID placeId,
                                @Valid @RequestBody PlaceRequest request) {
        return placeService.update(placeId, userId, request);
    }

    @DeleteMapping("/api/places/{placeId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UUID userId, @PathVariable UUID placeId) {
        placeService.delete(placeId, userId);
        return ResponseEntity.noContent().build();
    }
}
