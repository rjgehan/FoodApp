package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.RecipeDtos.CreateCategoryRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeCategoryResponse;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.TagRecipesRequest;
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

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Two phones doing the same thing to the same tags at the same moment. Each request checks, then
 * writes, so side by side both would pass the check: the first is held open, written but not
 * committed, until the second is queued behind it. Not transactional (each side needs its own
 * transaction to race), so it cleans up after itself.
 */
@SpringBootTest
class TagRaceTest {

    @Autowired RecipeService recipeService;
    @Autowired HouseholdService householdService;
    @Autowired UserRepository userRepository;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JdbcTemplate jdbc;
    @PersistenceContext EntityManager entityManager;

    private User owner;
    private UUID householdId;

    @BeforeEach
    void household() {
        owner = userRepository.save(User.builder()
                .username("tag-race-" + UUID.randomUUID().toString().substring(0, 8)).displayName("Owner").build());
        householdId = householdService.create(owner.getId(), new CreateHouseholdRequest("Tag race")).id();
    }

    @AfterEach
    void cleanUp() {
        householdService.delete(householdId, owner.getId());
        userRepository.deleteById(owner.getId());
    }

    /**
     * A recipe saved with a new tag typed in, and the same tag made from the drawer: neither check
     * can see the other's row, so it is the unique index that refuses the second — and that still
     * reads as the sentence the check would have given, not a 500.
     */
    @Test
    void losingARaceForATagNameIsTheUsualConflict() throws Exception {
        UUID pizza = recipe("Pizza");

        ExecutionException lost = whileHeldOpen(
                () -> recipeService.update(pizza, owner.getId(), request("Pizza", "Pizza night")),
                () -> recipeService.createCategory(householdId, owner.getId(),
                        new CreateCategoryRequest("pizza NIGHT", null, RecipeSection.DINNER, null)));

        assertThat(lost.getCause()).isInstanceOfSatisfying(ResponseStatusException.class, e -> {
            assertThat(e.getStatusCode().value()).isEqualTo(409);
            assertThat(e.getReason()).isEqualTo("There's already a tag called pizza NIGHT in Dinner.");
        });
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM recipe_categories WHERE household_id = ? AND lower(name) = 'pizza night'",
                Integer.class, householdId)).isEqualTo(1);
    }

    /** Both tagging the same recipe: the second waits its turn, then finds it already done. */
    @Test
    void twoPhonesTaggingTheSameRecipeBothSucceed() throws Exception {
        UUID curry = recipe("Curry");
        UUID chicken = recipeService.listCategories(householdId, owner.getId()).stream()
                .filter(c -> c.name().equals("Chicken") && c.section() == RecipeSection.DINNER)
                .findFirst().orElseThrow().id();
        TagRecipesRequest tagIt = new TagRecipesRequest(List.of(curry), null);

        ExecutionException failed = whileHeldOpen(
                () -> recipeService.tagRecipes(householdId, chicken, owner.getId(), tagIt),
                () -> recipeService.tagRecipes(householdId, chicken, owner.getId(), tagIt));

        assertThat(failed).isNull();
        assertThat(recipeService.listCategories(householdId, owner.getId()).stream()
                .filter(c -> c.id().equals(chicken)).map(RecipeCategoryResponse::recipeCount))
                .containsExactly(1);
        assertThat(recipeService.get(curry, householdId, owner.getId()).categories()).containsExactly("Chicken");
    }

    /**
     * Runs the first call in a transaction that stays open until the second is waiting on a
     * lock, then commits it. The first must succeed; returns how the second failed, or null.
     */
    private ExecutionException whileHeldOpen(Supplier<?> first, Supplier<?> second) throws Exception {
        CountDownLatch written = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> firstSide = pool.submit(() -> new TransactionTemplate(transactionManager).execute(tx -> {
                Object result = first.get();
                // Written but not committed: the rows are locked, and nobody else can see them yet.
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
            Future<?> secondSide = pool.submit(() -> new TransactionTemplate(transactionManager)
                    .execute(tx -> second.get()));
            waitUntilSomebodyIsQueuedOnALock();
            release.countDown();
            firstSide.get(10, TimeUnit.SECONDS);
            try {
                secondSide.get(10, TimeUnit.SECONDS);
                return null;
            } catch (ExecutionException e) {
                return e;
            }
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

    private UUID recipe(String name) {
        return recipeService.create(householdId, owner.getId(), request(name)).id();
    }

    private static RecipeRequest request(String name, String... tags) {
        return new RecipeRequest(name, null, null, null, null, 4, null, null, null, RecipeSection.DINNER,
                List.of(tags), null, null, List.of(new RecipeIngredientRequest("salt", BigDecimal.ONE, null, null, false)));
    }
}
