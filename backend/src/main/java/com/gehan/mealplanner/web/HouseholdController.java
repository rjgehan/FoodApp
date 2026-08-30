package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.HouseholdDtos.AddMemberRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateUserRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.HouseholdResponse;
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

    @PostMapping("/{householdId}/members")
    public ResponseEntity<MemberResponse> addMember(@AuthenticationPrincipal UUID userId,
                                                      @PathVariable UUID householdId,
                                                      @Valid @RequestBody AddMemberRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(householdService.addMember(householdId, userId, request));
    }

    @PostMapping("/{householdId}/users")
    public ResponseEntity<MemberResponse> createUser(@AuthenticationPrincipal UUID userId,
                                                      @PathVariable UUID householdId,
                                                      @Valid @RequestBody CreateUserRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(householdService.createUser(householdId, userId, request));
    }

    @PatchMapping("/{householdId}/settings")
    public HouseholdResponse updateSettings(@AuthenticationPrincipal UUID userId,
                                             @PathVariable UUID householdId,
                                             @Valid @RequestBody UpdateHouseholdSettingsRequest request) {
        return householdService.updateSettings(householdId, userId, request);
    }
}
