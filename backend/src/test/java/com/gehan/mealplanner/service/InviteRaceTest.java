package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.AuthDtos.SignupRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.repository.HouseholdInviteRepository;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Somebody using the house's link at the very moment the owner takes it away. The owner's side
 * is held open — link retired, not yet committed — until the other request is queued behind it,
 * which is the moment a request that had already read the link as live would write it back to
 * life. Not transactional (each side needs its own transaction to race), so it cleans up after
 * itself.
 */
@SpringBootTest
class InviteRaceTest {

    @Autowired InviteService inviteService;
    @Autowired HouseholdService householdService;
    @Autowired UserRepository userRepository;
    @Autowired HouseholdMemberRepository memberRepository;
    @Autowired HouseholdInviteRepository inviteRepository;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JdbcTemplate jdbc;
    @PersistenceContext EntityManager entityManager;

    private final List<UUID> users = new ArrayList<>();
    private User owner;
    private UUID householdId;
    private String tag;

    @BeforeEach
    void household() {
        tag = UUID.randomUUID().toString().substring(0, 8);
        owner = made(User.builder().username("race-owner-" + tag).displayName("Owner").build());
        householdId = householdService.create(owner.getId(), new CreateHouseholdRequest("Race IT")).id();
    }

    @AfterEach
    void cleanUp() {
        householdService.delete(householdId, owner.getId());
        // Only there when the late sign-up got in, which is the failure being tested for.
        userRepository.findByEmail(lateEmail()).ifPresent(userRepository::delete);
        userRepository.deleteAllById(users);
        users.clear();
    }

    @Test
    void somebodyRemovedWhileSayingYesAgainStaysOutAndTheLinkStaysDead() throws Exception {
        String token = inviteService.getOrCreate(householdId, owner.getId()).token();
        User member = made(User.builder().username("race-member-" + tag).displayName("Member").build());
        inviteService.accept(token, member.getId());

        int status = whileHeldOpen(
                () -> householdService.removeMember(householdId, owner.getId(), member.getId()),
                () -> inviteService.accept(token, member.getId()));

        assertThat(status).isEqualTo(410);
        assertThat(memberRepository.existsByHouseholdIdAndUserId(householdId, member.getId())).isFalse();
        assertThat(inviteRepository.findByToken(token).orElseThrow().getRevokedAt()).isNotNull();
    }

    @Test
    void signingUpAsTheOwnerThrowsTheLinkAwayNeitherGetsInNorRevivesIt() throws Exception {
        String token = inviteService.getOrCreate(householdId, owner.getId()).token();
        String email = lateEmail();

        int status = whileHeldOpen(
                () -> inviteService.revoke(householdId, owner.getId()),
                () -> inviteService.signUp(new SignupRequest(token, "Late", email, "long-enough")));

        assertThat(status).isEqualTo(410);
        assertThat(userRepository.findByEmail(email)).isEmpty();
        assertThat(inviteRepository.findByToken(token).orElseThrow().getRevokedAt()).isNotNull();
    }

    /**
     * Runs the owner's change in a transaction that stays open until the other request is waiting
     * on a lock, then commits it and reports what the other request answered.
     */
    private int whileHeldOpen(Runnable ownerChange, Runnable other) throws Exception {
        CountDownLatch changed = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> ownerSide = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
                ownerChange.run();
                // Written but not committed: the rows are locked, and nobody else can see it yet.
                entityManager.flush();
                changed.countDown();
                try {
                    release.await(10, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }));
            assertThat(changed.await(10, TimeUnit.SECONDS)).isTrue();
            Future<Integer> otherSide = pool.submit((Callable<Integer>) () -> {
                try {
                    other.run();
                    return 200;
                } catch (ResponseStatusException e) {
                    return e.getStatusCode().value();
                }
            });
            waitUntilSomebodyIsQueuedOnALock();
            release.countDown();
            ownerSide.get(10, TimeUnit.SECONDS);
            return otherSide.get(10, TimeUnit.SECONDS);
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    private void waitUntilSomebodyIsQueuedOnALock() throws InterruptedException {
        for (int i = 0; i < 200; i++) {
            Integer waiting = jdbc.queryForObject(
                    "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
                    Integer.class);
            if (waiting != null && waiting > 0) {
                return;
            }
            Thread.sleep(25);
        }
        throw new AssertionError("The second request never queued behind the owner's change");
    }

    private String lateEmail() {
        return "race-late-" + tag + "@example.com";
    }

    private User made(User user) {
        User saved = userRepository.save(user);
        users.add(saved.getId());
        return saved;
    }
}
