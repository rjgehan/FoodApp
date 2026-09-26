package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.CupboardDtos.AddCupboardItemRequest;
import com.gehan.mealplanner.dto.CupboardDtos.CupboardItemResponse;
import com.gehan.mealplanner.dto.GroceryListDtos.AddItemRequest;
import com.gehan.mealplanner.dto.GroceryListDtos.GroceryListItemResponse;
import com.gehan.mealplanner.dto.GroceryListDtos.PutAwayRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Two phones in one shop doing the same thing at the same moment: both pressing Done shopping,
 * or a double tap adding something nobody has ever added. Each of those reads, decides, then
 * writes, so side by side both would decide the same thing — take the same row off, make the
 * same new ingredient — and the second would fail on the database. Where the order matters, the
 * first request is held open, written but not committed, until the second is queued behind it:
 * the exact moment a request that had already read the old state would go wrong. Not
 * transactional (each side needs its own transaction to race), so it cleans up after itself.
 */
@SpringBootTest
class GroceryRaceTest {

    @Autowired IngredientService ingredientService;
    @Autowired GroceryListService groceryListService;
    @Autowired CupboardService cupboardService;
    @Autowired HouseholdService householdService;
    @Autowired UserRepository userRepository;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JdbcTemplate jdbc;
    @PersistenceContext EntityManager entityManager;

    private User owner;
    private UUID householdId;
    private String tag;

    @BeforeEach
    void household() {
        tag = UUID.randomUUID().toString().substring(0, 8);
        owner = userRepository.save(User.builder().username("grocery-race-" + tag).displayName("Owner").build());
        householdId = householdService.create(owner.getId(), new CreateHouseholdRequest("Grocery race")).id();
    }

    @AfterEach
    void cleanUp() {
        householdService.delete(householdId, owner.getId());
        userRepository.deleteById(owner.getId());
        jdbc.update("DELETE FROM ingredients WHERE normalized_name LIKE ?", "%-" + tag);
    }

    @Test
    void twoRequestsMakingTheSameNewIngredientBothGetTheOneRow() throws Exception {
        String name = "Brand new thing-" + tag;

        List<Ingredient> made = whileHeldOpen(
                () -> ingredientService.findOrCreate(name, null),
                () -> ingredientService.findOrCreate(name.toUpperCase(), null));

        assertThat(made.get(1).getId()).isEqualTo(made.get(0).getId());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ingredients WHERE normalized_name = ?",
                Integer.class, name.toLowerCase())).isEqualTo(1);
    }

    @Test
    void bothPressingDoneShoppingTakesTheRowOffOnceAndStocksItOnce() throws Exception {
        GroceryListItemResponse milk = groceryListService.addManualItem(householdId, owner.getId(),
                new AddItemRequest("milk-" + tag, null, null));
        groceryListService.setChecked(householdId, milk.id(), owner.getId(), true);
        PutAwayRequest done = new PutAwayRequest(List.of(milk.id()), List.of());

        whileHeldOpen(
                () -> {
                    groceryListService.putAway(householdId, owner.getId(), done);
                    return null;
                },
                () -> {
                    groceryListService.putAway(householdId, owner.getId(), done);
                    return null;
                });

        assertThat(groceryListService.listItems(householdId, owner.getId())).isEmpty();
        assertThat(cupboardService.list(householdId, owner.getId()))
                .extracting(CupboardItemResponse::name).containsExactly("milk-" + tag);
    }

    /** No holding open here: just two at once, several times, the way a double tap arrives. */
    @RepeatedTest(3)
    void aDoubleTappedAddOfSomethingNewIsOneCupboardItem() throws Exception {
        String name = "Never seen before-" + UUID.randomUUID().toString().substring(0, 4) + "-" + tag;
        List<CupboardItemResponse> added = atOnce(
                () -> cupboardService.add(householdId, owner.getId(), new AddCupboardItemRequest(name, null)));

        assertThat(added.get(1).id()).isEqualTo(added.get(0).id());
        assertThat(cupboardService.list(householdId, owner.getId()))
                .extracting(CupboardItemResponse::name).containsExactly(name);
    }

    @RepeatedTest(3)
    void aDoubleTappedAddToTheListIsOneRow() throws Exception {
        String name = "Oat milk " + UUID.randomUUID().toString().substring(0, 4) + "-" + tag;
        atOnce(() -> groceryListService.addManualItem(householdId, owner.getId(), new AddItemRequest(name, null, null)));

        assertThat(groceryListService.listItems(householdId, owner.getId())).hasSize(1);
    }

    /** Both calls in their own thread, let go together. Either failing fails the test. */
    private <T> List<T> atOnce(Supplier<T> call) throws Exception {
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<T>> outcomes = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                outcomes.add(pool.submit((Callable<T>) () -> {
                    go.await();
                    return call.get();
                }));
            }
            go.countDown();
            List<T> results = new ArrayList<>();
            for (Future<T> outcome : outcomes) {
                results.add(outcome.get(10, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    /**
     * Runs the first call in a transaction that stays open until the second is waiting on a
     * lock, then commits it, and returns what each answered. Either failing fails the test.
     */
    private <T> List<T> whileHeldOpen(Supplier<T> first, Supplier<T> second) throws Exception {
        CountDownLatch written = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<T> firstSide = pool.submit(() -> new TransactionTemplate(transactionManager).execute(tx -> {
                T result = first.get();
                // Written but not committed: the rows are locked, and nobody else can see it yet.
                entityManager.flush();
                written.countDown();
                try {
                    release.await(10, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                return result;
            }));
            assertThat(written.await(10, TimeUnit.SECONDS)).isTrue();
            Future<T> secondSide = pool.submit(() -> new TransactionTemplate(transactionManager).execute(tx -> second.get()));
            waitUntilSomebodyIsQueuedOnALock();
            release.countDown();
            // Not List.of: a call with nothing to return answers null.
            List<T> results = new ArrayList<>();
            results.add(firstSide.get(10, TimeUnit.SECONDS));
            results.add(secondSide.get(10, TimeUnit.SECONDS));
            return results;
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
        throw new AssertionError("The second request never queued behind the first");
    }
}
