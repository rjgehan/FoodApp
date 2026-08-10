package com.gehan.mealplanner.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public class AuthDtos {

    /** No password complexity rules on purpose — this is a small trusted family/friends app. */
    public record RegisterRequest(
            @NotBlank @Size(min = 2, max = 50) String username,
            @NotBlank String password,
            @NotBlank String displayName) {
    }

    public record LoginRequest(
            @NotBlank String username,
            @NotBlank String password) {
    }

    public record AuthResponse(String token, UUID userId, String displayName) {
    }
}
