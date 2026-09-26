package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.HouseholdDtos.ActiveHouseholdRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CredentialsRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.MeResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.MemberResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.UpdateProfileRequest;
import com.gehan.mealplanner.security.JwtService;
import com.gehan.mealplanner.service.AccountService;
import com.gehan.mealplanner.service.HouseholdService;
import org.springframework.http.ResponseEntity;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * You: your name, how you sign in, and the house you were last in. Deliberately nothing here
 * reaches anybody else's account — accounts are only ever made through an invite link.
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

    /** Includes your email and whether you have a password — what the "add an email" prompt checks. */
    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal UUID userId, Authentication auth) {
        return accountService.me(userId).forSession(JwtService.signedInWithPassword(auth));
    }

    /** Add or change your email and password. See AccountService.updateCredentials for the rules. */
    @PutMapping("/me/credentials")
    public MeResponse updateCredentials(@AuthenticationPrincipal UUID userId, Authentication auth,
                                        @Valid @RequestBody CredentialsRequest request) {
        return accountService.updateCredentials(userId, request).forSession(JwtService.signedInWithPassword(auth));
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
