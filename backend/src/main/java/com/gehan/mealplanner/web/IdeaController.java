package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.IdeaDtos.IdeaRequest;
import com.gehan.mealplanner.dto.IdeaDtos.IdeaResponse;
import com.gehan.mealplanner.dto.IdeaDtos.IdeaStatusRequest;
import com.gehan.mealplanner.service.AdminAccess;
import com.gehan.mealplanner.service.IdeaService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * The beta's ideas board. Not under a household: everyone signed in sees the same board.
 *
 * The admin here is the admin of the admin pages, by the same rule (AdminAccess) — which
 * includes having signed in with a password. Unlike those pages, the board is no secret, so a
 * refusal is the app's usual 403 with a sentence rather than a 404.
 */
@RestController
@RequestMapping("/api/ideas")
public class IdeaController {

    private final IdeaService ideaService;
    private final AdminAccess adminAccess;

    public IdeaController(IdeaService ideaService, AdminAccess adminAccess) {
        this.ideaService = ideaService;
        this.adminAccess = adminAccess;
    }

    /** `sort` is top (the default) or new. */
    @GetMapping
    public List<IdeaResponse> list(@AuthenticationPrincipal UUID userId,
                                   @RequestParam(required = false) String sort) {
        return ideaService.list(userId, sort);
    }

    @PostMapping
    public IdeaResponse create(@AuthenticationPrincipal UUID userId, @Valid @RequestBody IdeaRequest request) {
        return ideaService.create(userId, request);
    }

    /** Your own idea, reworded. */
    @PutMapping("/{ideaId}")
    public IdeaResponse update(@AuthenticationPrincipal UUID userId, @PathVariable UUID ideaId,
                               @Valid @RequestBody IdeaRequest request) {
        return ideaService.update(ideaId, userId, request);
    }

    /** Your own idea, or — for the admin — anybody's. */
    @DeleteMapping("/{ideaId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UUID userId, Authentication auth,
                                       @PathVariable UUID ideaId) {
        ideaService.delete(ideaId, userId, adminAccess.isAdmin(auth));
        return ResponseEntity.noContent().build();
    }

    /** Upvote. Sending it again changes nothing. Answers with the idea as it now stands. */
    @PutMapping("/{ideaId}/vote")
    public IdeaResponse vote(@AuthenticationPrincipal UUID userId, @PathVariable UUID ideaId) {
        return ideaService.vote(ideaId, userId, true);
    }

    /** Take your upvote back. Sending it again changes nothing either. */
    @DeleteMapping("/{ideaId}/vote")
    public IdeaResponse unvote(@AuthenticationPrincipal UUID userId, @PathVariable UUID ideaId) {
        return ideaService.vote(ideaId, userId, false);
    }

    /** The admin only: Open, Planned, Done or Not doing. */
    @PatchMapping("/{ideaId}/status")
    public IdeaResponse setStatus(@AuthenticationPrincipal UUID userId, Authentication auth,
                                  @PathVariable UUID ideaId, @Valid @RequestBody IdeaStatusRequest request) {
        return ideaService.setStatus(ideaId, userId, adminAccess.isAdmin(auth), request.status());
    }
}
