package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.CredentialsRequest;
import com.gehan.mealplanner.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.RepeatedTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Two accounts claiming the same address at the same moment. Both can pass the "is it taken?"
 * check before either has saved, so only the unique index can decide — and the loser has to
 * hear the same 409 as someone who was simply second. Not transactional (each claim needs its
 * own transaction to race), so it cleans up after itself.
 */
@SpringBootTest
class EmailRaceTest {

    @Autowired AccountService accountService;
    @Autowired UserRepository userRepository;

    private final List<UUID> made = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        userRepository.deleteAllById(made);
        made.clear();
    }

    @RepeatedTest(3)
    void twoAccountsRacingForOneAddressLeaveExactlyOneWinner() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        User a = userRepository.save(User.builder().username("race-a-" + tag).displayName("A").build());
        User b = userRepository.save(User.builder().username("race-b-" + tag).displayName("B").build());
        made.add(a.getId());
        made.add(b.getId());
        String address = "race-" + tag + "@example.com";

        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> outcomes = new ArrayList<>();
            for (Callable<Integer> claim : List.<Callable<Integer>>of(
                    () -> claim(go, a.getId(), address.toUpperCase()),
                    () -> claim(go, b.getId(), " " + address + " "))) {
                outcomes.add(pool.submit(claim));
            }
            go.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> outcome : outcomes) {
                statuses.add(outcome.get());
            }
            assertThat(statuses).containsExactlyInAnyOrder(200, 409);
        } finally {
            pool.shutdownNow();
        }

        long holders = userRepository.findAllById(made).stream()
                .filter(u -> address.equals(u.getEmail())).count();
        assertThat(holders).isEqualTo(1);
    }

    private int claim(CountDownLatch go, UUID userId, String email) throws InterruptedException {
        go.await();
        try {
            accountService.updateCredentials(userId, new CredentialsRequest(email, "race-password", null));
            return 200;
        } catch (ResponseStatusException e) {
            return e.getStatusCode().value();
        }
    }
}
