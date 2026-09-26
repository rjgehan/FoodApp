package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.HouseholdResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.RenameHouseholdRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.MemberResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.UpdateHouseholdSettingsRequest;
import com.gehan.mealplanner.service.HouseholdService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/households")
public class HouseholdController {

    private final HouseholdService householdService;

    public HouseholdController(HouseholdService householdService) {
        this.householdService = householdService;
    }

    @PostMapping
    public ResponseEntity<HouseholdResponse> create(@AuthenticationPrincipal UUID userId,
                                                      @Valid @RequestBody CreateHouseholdRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(householdService.create(userId, request));
    }

    @GetMapping
    public List<HouseholdResponse> listMine(@AuthenticationPrincipal UUID userId) {
        return householdService.listForUser(userId);
    }

    @GetMapping("/{householdId}/members")
    public List<MemberResponse> listMembers(@AuthenticationPrincipal UUID userId,
                                             @PathVariable UUID householdId) {
        return householdService.listMembers(householdId, userId);
    }

    /** Walk out of a household. Blocked if you are the last one in it. */
    @DeleteMapping("/{householdId}/members/me")
    public ResponseEntity<Void> leave(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        householdService.leave(householdId, userId);
        return ResponseEntity.noContent().build();
    }

    /**
     * The owner takes somebody else out. `members/me` above is the literal path and wins for
     * yourself, which is Leave; asking this for your own id is refused.
     */
    @DeleteMapping("/{householdId}/members/{userId}")
    public ResponseEntity<Void> removeMember(@AuthenticationPrincipal UUID ownerId,
                                             @PathVariable UUID householdId,
                                             @PathVariable UUID userId) {
        householdService.removeMember(householdId, ownerId, userId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Delete the household and everything in it. Owner only, and irreversible — the way out
     * for the last person in, who is not allowed to simply leave.
     */
    @DeleteMapping("/{householdId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        householdService.delete(householdId, userId);
        return ResponseEntity.noContent().build();
    }

    /** Owner only — see HouseholdService.rename. */
    @PatchMapping("/{householdId}/name")
    public HouseholdResponse rename(@AuthenticationPrincipal UUID userId,
                                    @PathVariable UUID householdId,
                                    @Valid @RequestBody RenameHouseholdRequest request) {
        return householdService.rename(householdId, userId, request.name());
    }

    @PatchMapping("/{householdId}/settings")
    public HouseholdResponse updateSettings(@AuthenticationPrincipal UUID userId,
                                             @PathVariable UUID householdId,
                                             @Valid @RequestBody UpdateHouseholdSettingsRequest request) {
        return householdService.updateSettings(householdId, userId, request);
    }

}
