package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.HouseholdDtos.ActiveHouseholdRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CredentialsRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.MeResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.MemberResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.ThemeRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.ThemeResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.UpdateProfileRequest;
import com.gehan.mealplanner.security.JwtService;
import com.gehan.mealplanner.service.AccountService;
import com.gehan.mealplanner.service.HouseholdService;
import com.gehan.mealplanner.service.ThemeSettings;
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
 * You: your name, how you sign in, the house you were last in, and the app's colours. Deliberately nothing here
 * reaches anybody else's account — accounts are only ever made through an invite link.
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final HouseholdService householdService;
    private final AccountService accountService;
    private final ThemeSettings themeSettings;

    public UserController(HouseholdService householdService, AccountService accountService,
                          ThemeSettings themeSettings) {
        this.householdService = householdService;
        this.accountService = accountService;
        this.themeSettings = themeSettings;
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

    /**
     * Your colours, on every device you sign in on. All four fields at once; one left out goes
     * back to the default. A path of its own so nothing an older app sends to /me can touch it.
     */
    @PutMapping("/me/theme")
    public ThemeResponse setTheme(@AuthenticationPrincipal UUID userId, @Valid @RequestBody ThemeRequest request) {
        return themeSettings.update(userId, request);
    }

    /** Rename yourself — and only yourself; there is no path here to editing anybody else. */
    @PatchMapping("/me")
    public MemberResponse updateMe(@AuthenticationPrincipal UUID userId,
                                   @Valid @RequestBody UpdateProfileRequest request) {
        return householdService.updateProfile(userId, request);
    }
}
