package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.IdeaStatus;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CredentialsRequest;
import com.gehan.mealplanner.dto.IdeaDtos.IdeaRequest;
import com.gehan.mealplanner.dto.IdeaDtos.IdeaResponse;
import com.gehan.mealplanner.dto.IdeaDtos.IdeaStatusRequest;
import com.gehan.mealplanner.repository.UserRepository;
import com.gehan.mealplanner.security.JwtService;
import com.gehan.mealplanner.web.IdeaController;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The ideas board against the real database, with an admin configured: votes are one each and
 * can be sent twice, only the admin moves an idea on (and only signed in with a password), the
 * board's order, the daily limit, and what deleting an account leaves behind. Rolled back after
 * each test.
 *
 * Everything here happens in one transaction, where the service's votes (written in SQL) would
 * otherwise reach the database before the idea they point at; `flush()` sends the idea first.
 */
@SpringBootTest(properties = {
        "app.admin.emails=boss@ideas-it.example",
        "app.admin.usernames=ideas-it-boss",
})
@Transactional
class IdeaDatabaseTest {

    private static final String ADMIN_EMAIL = "boss@ideas-it.example";
    private static final String ADMIN_USERNAME = "ideas-it-boss";

    @Autowired IdeaService ideaService;
    @Autowired IdeaController ideaController;
    @Autowired AccountService accountService;
    @Autowired HouseholdService householdService;
    @Autowired UserRepository userRepository;
    @PersistenceContext EntityManager entityManager;

    private String tag;

    @BeforeEach
    void tag() {
        tag = UUID.randomUUID().toString().substring(0, 8);
    }

    private User account(String name) {
        User user = userRepository.save(User.builder().username("ideas-it-" + name + "-" + tag).displayName(name).build());
        entityManager.flush();
        return user;
    }

    private IdeaResponse suggest(User author, String title) {
        IdeaResponse idea = ideaService.create(author.getId(), new IdeaRequest(title + " " + tag, null));
        entityManager.flush();
        return idea;
    }

    /** The board as this person sees it, narrowed to this test's ideas — the database is shared. */
    private List<IdeaResponse> board(User viewer, String sort) {
        return ideaService.list(viewer.getId(), sort).stream().filter(i -> i.title().endsWith(tag)).toList();
    }

    private IdeaResponse seen(User viewer, UUID ideaId) {
        return board(viewer, null).stream().filter(i -> i.id().equals(ideaId)).findFirst().orElseThrow();
    }

    private static void refused(ThrowingCallable call, HttpStatus status) {
        assertThatThrownBy(call)
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(status);
    }

    private static Authentication session(User user, boolean withPassword) {
        return new UsernamePasswordAuthenticationToken(user.getId(), null,
                withPassword ? List.of(new SimpleGrantedAuthority(JwtService.PASSWORD_SESSION)) : List.of());
    }

    @Test
    void votingTwiceIsStillOneVoteAndTakingItBackTwiceIsNone() {
        User cook = account("cook");
        IdeaResponse idea = suggest(cook, "Dark mode");
        assertThat(idea.voteCount()).isZero();
        assertThat(idea.mine()).isTrue();

        IdeaResponse once = ideaService.vote(idea.id(), cook.getId(), true);
        IdeaResponse twice = ideaService.vote(idea.id(), cook.getId(), true);
        assertThat(once.voteCount()).isEqualTo(1);
        assertThat(twice.voteCount()).isEqualTo(1);
        assertThat(twice.votedByMe()).isTrue();

        IdeaResponse off = ideaService.vote(idea.id(), cook.getId(), false);
        IdeaResponse offAgain = ideaService.vote(idea.id(), cook.getId(), false);
        assertThat(off.voteCount()).isZero();
        assertThat(offAgain.voteCount()).isZero();
        assertThat(offAgain.votedByMe()).isFalse();
    }

    @Test
    void everyoneGetsOneVoteEachAndSeesTheirOwn() {
        User author = account("author");
        User fan = account("fan");
        User other = account("other");
        IdeaResponse idea = suggest(author, "Shopping list widget");

        ideaService.vote(idea.id(), author.getId(), true);
        ideaService.vote(idea.id(), fan.getId(), true);
        ideaService.vote(idea.id(), fan.getId(), true);

        assertThat(seen(fan, idea.id())).satisfies(i -> {
            assertThat(i.voteCount()).isEqualTo(2);
            assertThat(i.votedByMe()).isTrue();
            assertThat(i.mine()).isFalse();
            assertThat(i.authorName()).isEqualTo("author");
        });
        assertThat(seen(other, idea.id())).satisfies(i -> {
            assertThat(i.voteCount()).isEqualTo(2);
            assertThat(i.votedByMe()).isFalse();
        });
    }

    @Test
    void onlyTheAdminSignedInWithAPasswordMovesAnIdeaOn() {
        User author = account("hopeful");
        IdeaResponse idea = suggest(author, "Meal ratings");
        User boss = userRepository.save(User.builder().username(ADMIN_USERNAME).displayName("Boss").build());
        accountService.updateCredentials(boss.getId(), new CredentialsRequest(ADMIN_EMAIL, "boss-password", null));
        entityManager.flush();

        // Not the author, not the admin by PIN.
        refused(() -> ideaController.setStatus(author.getId(), session(author, true), idea.id(),
                new IdeaStatusRequest(IdeaStatus.PLANNED)), HttpStatus.FORBIDDEN);
        refused(() -> ideaController.setStatus(boss.getId(), session(boss, false), idea.id(),
                new IdeaStatusRequest(IdeaStatus.PLANNED)), HttpStatus.FORBIDDEN);
        assertThat(seen(author, idea.id()).status()).isEqualTo(IdeaStatus.OPEN);

        IdeaResponse planned = ideaController.setStatus(boss.getId(), session(boss, true), idea.id(),
                new IdeaStatusRequest(IdeaStatus.PLANNED));
        assertThat(planned.status()).isEqualTo(IdeaStatus.PLANNED);
        assertThat(planned.mine()).isFalse();
        assertThat(seen(author, idea.id()).status()).isEqualTo(IdeaStatus.PLANNED);
    }

    @Test
    void onlyTheAuthorRewordsItAndOnlyTheAuthorOrTheAdminTakesItDown() {
        User author = account("writer");
        User stranger = account("stranger");
        IdeaResponse idea = suggest(author, "Recipe timers");

        refused(() -> ideaService.update(idea.id(), stranger.getId(), new IdeaRequest("Mine now " + tag, null)),
                HttpStatus.FORBIDDEN);
        refused(() -> ideaService.delete(idea.id(), stranger.getId(), false), HttpStatus.FORBIDDEN);

        IdeaResponse reworded = ideaService.update(idea.id(), author.getId(),
                new IdeaRequest("  Cooking timers " + tag + "  ", "  On each step.  "));
        assertThat(reworded.title()).isEqualTo("Cooking timers " + tag);
        assertThat(reworded.details()).isEqualTo("On each step.");

        // The admin takes down somebody else's; the author takes down their own.
        ideaService.delete(idea.id(), stranger.getId(), true);
        entityManager.clear();
        refused(() -> ideaService.vote(idea.id(), author.getId(), true), HttpStatus.NOT_FOUND);
        IdeaResponse second = suggest(author, "Second thoughts");
        ideaService.delete(second.id(), author.getId(), false);
        assertThat(board(author, null)).isEmpty();
    }

    @Test
    void topIsMostWantedFirstWithSettledOnesLastAndNewIsNewestFirst() throws InterruptedException {
        User cook = account("voter");
        User fan = account("fan");
        User boss = account("admin-stand-in");
        IdeaResponse quiet = suggest(cook, "Quiet");
        // Far enough apart to have different times; the order of "new" depends on it.
        Thread.sleep(5);
        IdeaResponse popular = suggest(cook, "Popular");
        Thread.sleep(5);
        IdeaResponse finished = suggest(cook, "Finished");

        ideaService.vote(popular.id(), cook.getId(), true);
        ideaService.vote(popular.id(), fan.getId(), true);
        ideaService.vote(finished.id(), cook.getId(), true);
        ideaService.vote(finished.id(), fan.getId(), true);
        ideaService.vote(finished.id(), boss.getId(), true);
        ideaService.setStatus(finished.id(), boss.getId(), true, IdeaStatus.DONE);

        assertThat(board(cook, "top")).extracting(IdeaResponse::id).containsExactly(popular.id(), quiet.id(), finished.id());
        assertThat(board(cook, null)).extracting(IdeaResponse::id).containsExactly(popular.id(), quiet.id(), finished.id());
        assertThat(board(cook, "new")).extracting(IdeaResponse::id).containsExactly(finished.id(), popular.id(), quiet.id());
    }

    @Test
    void tenIdeasADayAndThenNoMore() {
        User keen = account("keen");
        for (int i = 0; i < IdeaService.IDEAS_PER_DAY; i++) {
            suggest(keen, "Idea " + i);
        }
        refused(() -> suggest(keen, "One too many"), HttpStatus.TOO_MANY_REQUESTS);
        // Somebody else is not held up by it.
        assertThat(suggest(account("calm"), "Mine").voteCount()).isZero();
    }

    @Test
    void deletingAnAccountTakesItsVotesAndLeavesItsIdeasFromSomeone() {
        User leaving = account("leaving");
        householdService.create(leaving.getId(), new CreateHouseholdRequest("Ideas IT " + tag));
        User staying = account("staying");
        IdeaResponse theirs = suggest(leaving, "Their idea");
        IdeaResponse mine = suggest(staying, "My idea");
        ideaService.vote(theirs.id(), staying.getId(), true);
        ideaService.vote(theirs.id(), leaving.getId(), true);
        ideaService.vote(mine.id(), leaving.getId(), true);

        householdService.deleteAccount(leaving.getId());
        entityManager.flush();
        entityManager.clear();

        assertThat(userRepository.findById(leaving.getId())).isEmpty();
        assertThat(seen(staying, theirs.id())).satisfies(i -> {
            assertThat(i.authorName()).isEqualTo(IdeaService.SOMEONE);
            assertThat(i.mine()).isFalse();
            assertThat(i.voteCount()).isEqualTo(1);
            assertThat(i.votedByMe()).isTrue();
        });
        assertThat(seen(staying, mine.id()).voteCount()).isZero();
    }

    @Test
    void meSaysTheBoardIsOpen() {
        assertThat(accountService.me(account("curious").getId()).ideasBoard()).isTrue();
        assertThat(ideaService.enabled()).isTrue();
    }
}
