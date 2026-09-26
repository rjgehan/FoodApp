package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.HouseholdDtos.ActiveHouseholdRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateUserRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CredentialsRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.MeResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.MemberResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.UpdateProfileRequest;
import com.gehan.mealplanner.service.AccountService;
import com.gehan.mealplanner.service.HouseholdService;
import org.springframework.http.ResponseEntity;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Accounts that belong to no household — deliberately not under /api/households/{id}, because
 * the whole point is that they are nobody's house yet. Any signed-in person can make one; this
 * is a small app for people who already know each other.
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final HouseholdService householdService;
    private final AccountService accountService;

    public UserController(HouseholdService householdService, AccountService accountService) {
        this.householdService = householdService;
        this.accountService = accountService;
    }

    @PostMapping
    public MemberResponse create(@Valid @RequestBody CreateUserRequest request) {
        return householdService.createUnassignedUser(request);
    }

    /** Includes your email and whether you have a password — what the "add an email" prompt checks. */
    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal UUID userId) {
        return accountService.me(userId);
    }

    /** Add or change your email and password. See AccountService.updateCredentials for the rules. */
    @PutMapping("/me/credentials")
    public MeResponse updateCredentials(@AuthenticationPrincipal UUID userId,
                                        @Valid @RequestBody CredentialsRequest request) {
        return accountService.updateCredentials(userId, request);
    }

    /** The household you just switched to, remembered for your next sign-in on any device. */
    @PutMapping("/me/active-household")
    public ResponseEntity<Void> setActiveHousehold(@AuthenticationPrincipal UUID userId,
                                                   @Valid @RequestBody ActiveHouseholdRequest request) {
        accountService.setActiveHousehold(userId, request.householdId());
        return ResponseEntity.noContent().build();
    }

    /** Rename yourself — and only yourself; there is no path here to editing anybody else. */
    @PatchMapping("/me")
    public MemberResponse updateMe(@AuthenticationPrincipal UUID userId,
                                   @Valid @RequestBody UpdateProfileRequest request) {
        return householdService.updateProfile(userId, request);
    }
}
