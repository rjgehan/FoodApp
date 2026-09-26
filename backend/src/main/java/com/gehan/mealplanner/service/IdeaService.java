package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Idea;
import com.gehan.mealplanner.domain.IdeaStatus;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.IdeaDtos.IdeaRequest;
import com.gehan.mealplanner.dto.IdeaDtos.IdeaResponse;
import com.gehan.mealplanner.repository.IdeaRepository;
import com.gehan.mealplanner.repository.IdeaVoteRepository;
import com.gehan.mealplanner.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The ideas board: the beta's suggestion box, one for the whole app rather than one per house.
 * Anyone signed in can suggest an idea, upvote as many as they like (once each, their own
 * included), and reword or take back their own. The admin moves ideas along — Planned, Done,
 * Not doing — and can take any of them down.
 *
 * Only for the beta. With app.ideas.enabled off (IDEAS_BOARD=false) /api/users/me says so, the
 * apps hide the button, and everything here answers 404: there is no board to find.
 */
@Service
public class IdeaService {

    /** Plenty for somebody with a lot to say; a stop for a script, or a Post button held down. */
    public static final int IDEAS_PER_DAY = 10;
    /** Who an idea is from once the account that suggested it has been deleted. */
    public static final String SOMEONE = "Someone";

    private final IdeaRepository ideaRepository;
    private final IdeaVoteRepository voteRepository;
    private final UserRepository userRepository;
    private final JdbcTemplate jdbc;
    private final boolean enabled;

    public IdeaService(IdeaRepository ideaRepository,
                       IdeaVoteRepository voteRepository,
                       UserRepository userRepository,
                       JdbcTemplate jdbc,
                       @Value("${app.ideas.enabled:true}") boolean enabled) {
        this.ideaRepository = ideaRepository;
        this.voteRepository = voteRepository;
        this.userRepository = userRepository;
        this.jdbc = jdbc;
        this.enabled = enabled;
    }

    /** Whether the board is open at all — what /api/users/me tells the apps. */
    public boolean enabled() {
        return enabled;
    }

    /**
     * The whole board, as this person sees it. "new" is newest first. Anything else is top:
     * most votes first — but ideas that are done or decided against go below the ones still
     * waiting, because a vote for those no longer changes anything, and the top of the board is
     * where people look for what to back next.
     */
    @Transactional(readOnly = true)
    public List<IdeaResponse> list(UUID userId, String sort) {
        requireOpen();
        Map<UUID, Long> votes = new HashMap<>();
        for (Object[] row : voteRepository.countByIdea()) {
            votes.put((UUID) row[0], (Long) row[1]);
        }
        Set<UUID> voted = new HashSet<>(voteRepository.findIdeaIdsVotedBy(userId));

        Comparator<IdeaResponse> newest = Comparator.comparing(IdeaResponse::createdAt).reversed();
        Comparator<IdeaResponse> order = "new".equalsIgnoreCase(sort) ? newest
                : Comparator.comparing((IdeaResponse idea) -> idea.status().isSettled())
                        .thenComparing(Comparator.comparingLong(IdeaResponse::voteCount).reversed())
                        .thenComparing(newest);

        return ideaRepository.findAllWithAuthor().stream()
                .map(idea -> toResponse(idea, userId, votes.getOrDefault(idea.getId(), 0L), voted.contains(idea.getId())))
                .sorted(order)
                .toList();
    }

    @Transactional
    public IdeaResponse create(UUID userId, IdeaRequest request) {
        requireOpen();
        User author = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        Instant now = Instant.now();
        if (ideaRepository.countByAuthorIdAndCreatedAtAfter(userId, now.minus(Duration.ofDays(1))) >= IDEAS_PER_DAY) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "That's " + IDEAS_PER_DAY + " ideas in a day — thank you! Keep the next one for tomorrow.");
        }
        Idea idea = ideaRepository.save(Idea.builder()
                .author(author)
                .title(request.title().trim())
                .details(blankToNull(request.details()))
                .createdAt(now)
                .updatedAt(now)
                .build());
        return toResponse(idea, userId, 0, false);
    }

    /**
     * Rewording is the author's alone — not even the admin's, whose part is saying what happens
     * to an idea, not changing what it says. Votes stay: it is still the same idea.
     */
    @Transactional
    public IdeaResponse update(UUID ideaId, UUID userId, IdeaRequest request) {
        requireOpen();
        Idea idea = find(ideaId);
        if (!isAuthor(idea, userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only change your own ideas.");
        }
        idea.setTitle(request.title().trim());
        idea.setDetails(blankToNull(request.details()));
        idea.setUpdatedAt(Instant.now());
        return respond(ideaRepository.save(idea), userId);
    }

    /** The author takes their idea back, or the admin takes it down. Its votes go with it. */
    @Transactional
    public void delete(UUID ideaId, UUID userId, boolean admin) {
        requireOpen();
        Idea idea = find(ideaId);
        if (!admin && !isAuthor(idea, userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only delete your own ideas.");
        }
        jdbc.update("DELETE FROM idea_votes WHERE idea_id = ?", ideaId);
        jdbc.update("DELETE FROM ideas WHERE id = ?", ideaId);
    }

    /**
     * Your vote on, or off. Either way round it can be sent twice — a double tap, a retry after
     * a dropped connection — and ends the same: one vote, or none. ON CONFLICT DO NOTHING rather
     * than check-then-insert, so two taps landing together cannot both insert and have the
     * second fail its whole request on the unique pair.
     */
    @Transactional
    public IdeaResponse vote(UUID ideaId, UUID userId, boolean up) {
        requireOpen();
        Idea idea = find(ideaId);
        if (up) {
            jdbc.update("""
                    INSERT INTO idea_votes (id, idea_id, user_id, created_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT DO NOTHING
                    """, UUID.randomUUID(), ideaId, userId, Timestamp.from(Instant.now()));
        } else {
            jdbc.update("DELETE FROM idea_votes WHERE idea_id = ? AND user_id = ?", ideaId, userId);
        }
        return respond(idea, userId);
    }

    /** The admin's call on where an idea has got to. The caller works out who is the admin. */
    @Transactional
    public IdeaResponse setStatus(UUID ideaId, UUID userId, boolean admin, IdeaStatus status) {
        requireOpen();
        if (!admin) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the app's admin can change where an idea is up to.");
        }
        Idea idea = find(ideaId);
        if (idea.getStatus() != status) {
            idea.setStatus(status);
            idea.setUpdatedAt(Instant.now());
        }
        return respond(ideaRepository.save(idea), userId);
    }

    /** 404 rather than 403 or 410: switched off, the board is simply not there to be found. */
    private void requireOpen() {
        if (!enabled) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "The ideas board is closed.");
        }
    }

    private Idea find(UUID ideaId) {
        return ideaRepository.findById(ideaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "That idea isn't on the board any more."));
    }

    private static boolean isAuthor(Idea idea, UUID userId) {
        return idea.getAuthor() != null && idea.getAuthor().getId().equals(userId);
    }

    /** One idea after a change, counted afresh — including a vote written a moment ago in SQL. */
    private IdeaResponse respond(Idea idea, UUID userId) {
        return toResponse(idea, userId, voteRepository.countByIdeaId(idea.getId()),
                voteRepository.existsByIdeaIdAndUserId(idea.getId(), userId));
    }

    private static IdeaResponse toResponse(Idea idea, UUID userId, long votes, boolean votedByMe) {
        User author = idea.getAuthor();
        return new IdeaResponse(idea.getId(), idea.getTitle(), idea.getDetails(), idea.getStatus(),
                author == null ? SOMEONE : author.getDisplayName(),
                isAuthor(idea, userId),
                votes, votedByMe, idea.getCreatedAt(), idea.getUpdatedAt());
    }

    private static String blankToNull(String text) {
        return text == null || text.isBlank() ? null : text.trim();
    }
}
