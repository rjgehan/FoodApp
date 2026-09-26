package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.AuthDtos.AuthResponse;
import com.gehan.mealplanner.dto.AuthDtos.EmailLoginRequest;
import com.gehan.mealplanner.dto.AuthDtos.UsePasswordResetRequest;
import com.gehan.mealplanner.dto.AuthDtos.LandingResponse;
import com.gehan.mealplanner.dto.AuthDtos.LoginRequest;
import com.gehan.mealplanner.dto.AuthDtos.SetPinRequest;
import com.gehan.mealplanner.dto.AuthDtos.SetupRequest;
import com.gehan.mealplanner.dto.AuthDtos.SignupRequest;
import com.gehan.mealplanner.dto.AuthDtos.UserSummary;
import com.gehan.mealplanner.security.JwtService;
import com.gehan.mealplanner.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * All of this is deliberately unauthenticated — it is what the login screen draws before anyone
 * has signed in. There is no open registration: a new account is made from an invite link
 * (/signup), or at first-run setup when the server has nobody at all.
 *
 * The name-and-PIN endpoints (/households/{id}/users, /users/{username}, /login, /pin) answer
 * 410 once app.auth.legacy-pin-login is off; email sign-in is always on.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @GetMapping("/landing")
    public LandingResponse landing() {
        return authService.landing();
    }

    @GetMapping("/households/{householdId}/users")
    public List<UserSummary> householdUsers(@PathVariable UUID householdId) {
        return authService.listHouseholdUsers(householdId);
    }

    @GetMapping("/users/{username}")
    public UserSummary user(@PathVariable String username) {
        return authService.findUser(username);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/login/email")
    public AuthResponse loginWithEmail(@Valid @RequestBody EmailLoginRequest request) {
        return authService.loginWithEmail(request);
    }

    /** The other half of an owner's reset link (see PasswordResetController). Signs them in. */
    @PostMapping("/password-reset")
    public AuthResponse usePasswordReset(@Valid @RequestBody UsePasswordResetRequest request) {
        return authService.usePasswordReset(request);
    }

    @PostMapping("/pin")
    public AuthResponse setInitialPin(@Valid @RequestBody SetPinRequest request) {
        return authService.setInitialPin(request);
    }

    /**
     * Swaps a still-valid token for a fresh one, so a session lasts as long as you keep using it.
     * This path is open like the rest of /api/auth, so the signed-in check happens here instead.
     */
    @PostMapping("/refresh")
    public AuthResponse refresh(@AuthenticationPrincipal UUID userId, Authentication auth) {
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Signed out");
        }
        return authService.refresh(userId, JwtService.signedInWithPassword(auth));
    }

    /**
     * A new account through an invite link: made, put in that household, and signed in. Refused
     * without a link that still works — this is not a way to make an account on its own.
     */
    @PostMapping("/signup")
    public ResponseEntity<AuthResponse> signUp(@Valid @RequestBody SignupRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.signUp(request));
    }

    @PostMapping("/setup")
    public ResponseEntity<AuthResponse> setup(@Valid @RequestBody SetupRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.setup(request));
    }
}
