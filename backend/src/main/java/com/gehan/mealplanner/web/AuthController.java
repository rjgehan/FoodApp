package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.AuthDtos.AuthResponse;
import com.gehan.mealplanner.dto.AuthDtos.LandingResponse;
import com.gehan.mealplanner.dto.AuthDtos.LoginRequest;
import com.gehan.mealplanner.dto.AuthDtos.SetPinRequest;
import com.gehan.mealplanner.dto.AuthDtos.SetupRequest;
import com.gehan.mealplanner.dto.AuthDtos.UserSummary;
import com.gehan.mealplanner.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * All of this is deliberately unauthenticated — it is what the login screen draws before anyone
 * has signed in. There is no self-registration: new accounts are made from inside a household.
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

    @PostMapping("/pin")
    public AuthResponse setInitialPin(@Valid @RequestBody SetPinRequest request) {
        return authService.setInitialPin(request);
    }

    /**
     * Swaps a still-valid token for a fresh one, so a session lasts as long as you keep using it.
     * This path is open like the rest of /api/auth, so the signed-in check happens here instead.
     */
    @PostMapping("/refresh")
    public AuthResponse refresh(@AuthenticationPrincipal UUID userId) {
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Signed out");
        }
        return authService.refresh(userId);
    }

    @PostMapping("/setup")
    public ResponseEntity<AuthResponse> setup(@Valid @RequestBody SetupRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.setup(request));
    }
}
