package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.HouseholdDtos.HouseholdResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.InviteInfo;
import com.gehan.mealplanner.dto.HouseholdDtos.InviteResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.InviteStanding;
import com.gehan.mealplanner.service.InviteService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Invite links. Showing and throwing away a household's link is for people in it; reading what a
 * link says is public, since the person opening it may not have an account yet; saying yes is
 * signed in. Making an account from a link is POST /api/auth/signup.
 */
@RestController
public class InviteController {

    private final InviteService inviteService;

    public InviteController(InviteService inviteService) {
        this.inviteService = inviteService;
    }

    /** The household's live link, made on the spot if there is none. Any member. */
    @GetMapping("/api/households/{householdId}/invite")
    public InviteResponse invite(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return inviteService.getOrCreate(householdId, userId);
    }

    /** Owner only. The old link stops working; the next GET makes a new one. */
    @DeleteMapping("/api/households/{householdId}/invite")
    public ResponseEntity<Void> revoke(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        inviteService.revoke(householdId, userId);
        return ResponseEntity.noContent().build();
    }

    /** Whose house, who asked, how many live there — or just valid=false. The token is the credential. */
    @GetMapping("/api/public/invites/{token}")
    public InviteInfo describe(@PathVariable String token) {
        return inviteService.describe(token);
    }

    /** Whether whoever is signed in is in this link's house already. 404/410 like accepting. */
    @GetMapping("/api/invites/{token}")
    public InviteStanding standing(@AuthenticationPrincipal UUID userId, @PathVariable String token) {
        return inviteService.standing(token, userId);
    }

    /** Join, as whoever is signed in. Already in is fine — the answer is the same household. */
    @PostMapping("/api/invites/{token}/accept")
    public HouseholdResponse accept(@AuthenticationPrincipal UUID userId, @PathVariable String token) {
        return inviteService.accept(token, userId);
    }
}
