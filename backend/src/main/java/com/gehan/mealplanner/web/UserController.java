package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.HouseholdDtos.CreateUserRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.MemberResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.UpdateProfileRequest;
import com.gehan.mealplanner.service.HouseholdService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
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

    public UserController(HouseholdService householdService) {
        this.householdService = householdService;
    }

    @PostMapping
    public MemberResponse create(@Valid @RequestBody CreateUserRequest request) {
        return householdService.createUnassignedUser(request);
    }

    @GetMapping("/me")
    public MemberResponse me(@AuthenticationPrincipal UUID userId) {
        return householdService.me(userId);
    }

    /** Rename yourself — and only yourself; there is no path here to editing anybody else. */
    @PatchMapping("/me")
    public MemberResponse updateMe(@AuthenticationPrincipal UUID userId,
                                   @Valid @RequestBody UpdateProfileRequest request) {
        return householdService.updateProfile(userId, request);
    }
}
