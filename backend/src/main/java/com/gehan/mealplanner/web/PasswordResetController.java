package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.AuthDtos.PasswordResetInfo;
import com.gehan.mealplanner.dto.AuthDtos.PasswordResetLinkResponse;
import com.gehan.mealplanner.service.AccountService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Forgotten passwords, with no email sending: the household owner makes a one-time link and
 * hands it over. Making one is signed in and owner-only; reading one is public, since the person
 * opening it is by definition not signed in. Using it is POST /api/auth/password-reset.
 */
@RestController
public class PasswordResetController {

    private final AccountService accountService;

    public PasswordResetController(AccountService accountService) {
        this.accountService = accountService;
    }

    @PostMapping("/api/households/{householdId}/members/{userId}/password-reset")
    public ResponseEntity<PasswordResetLinkResponse> create(@AuthenticationPrincipal UUID ownerId,
                                                            @PathVariable UUID householdId,
                                                            @PathVariable UUID userId) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(accountService.createPasswordReset(householdId, ownerId, userId));
    }

    /** Whose link this is and whether it still works — the 256-bit token is the credential. */
    @GetMapping("/api/public/password-resets/{token}")
    public PasswordResetInfo describe(@PathVariable String token) {
        return accountService.describeReset(token);
    }
}
