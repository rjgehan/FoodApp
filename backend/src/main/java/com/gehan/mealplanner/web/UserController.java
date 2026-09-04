package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.HouseholdDtos.CreateUserRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.MemberResponse;
import com.gehan.mealplanner.service.HouseholdService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
}
