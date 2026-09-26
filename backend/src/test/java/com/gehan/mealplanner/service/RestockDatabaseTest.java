package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.CupboardDtos.AddCupboardItemRequest;
import com.gehan.mealplanner.dto.CupboardDtos.CupboardItemResponse;
import com.gehan.mealplanner.dto.CupboardDtos.UpdateCupboardItemRequest;
import com.gehan.mealplanner.dto.GroceryListDtos.AddItemRequest;
import com.gehan.mealplanner.dto.GroceryListDtos.GroceryListItemResponse;
import com.gehan.mealplanner.dto.GroceryListDtos.PutAwayRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.RestockDtos.AddDueRequest;
import com.gehan.mealplanner.dto.RestockDtos.RestockReminderResponse;
import com.gehan.mealplanner.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Restock reminders against the real database, on a clock the test moves: a reminder comes due
 * once its days have passed since it was last bought, buying it starts that over, "Not now"
 * holds for three days, and something waiting on the list is not asked about. Rolled back after
 * each test.
 */
@SpringBootTest
@Transactional
class RestockDatabaseTest {

    @Autowired RestockService restockService;
    @Autowired RestockClock restockClock;
    @Autowired GroceryListService groceryListService;
    @Autowired CupboardService cupboardService;
    @Autowired HouseholdService householdService;
    @Autowired UserRepository userRepository;

    private final MovableClock clock = new MovableClock(Instant.parse("2031-09-02T09:00:00Z"));
    private User me;
    private UUID home;
    private String tag;

    @BeforeEach
    void household() {
        restockClock.use(clock);
        tag = UUID.randomUUID().toString().substring(0, 8);
        me = userRepository.save(User.builder().username("restock-" + tag).displayName("Me").build());
        home = householdService.create(me.getId(), new CreateHouseholdRequest("Restock")).id();
    }

    @AfterEach
    void realTime() {
        restockClock.use(Clock.systemUTC());
    }

    @Test
    void aNewReminderComesDueOnceItsDaysHavePassed() {
        RestockReminderResponse set = remind("coffee", 21);
        assertThat(set.lastBoughtAt()).isEqualTo(clock.instant());
        assertThat(set.due()).isFalse();

        clock.advance(Duration.ofDays(21).minusMinutes(1));
        assertThat(due()).isEmpty();

        clock.advance(Duration.ofMinutes(1));
        assertThat(due()).extracting(RestockReminderResponse::name).containsExactly(name("coffee"));
    }

    @Test
    void puttingItAwayStartsTheClockOver() {
        remind("filters", 7);
        clock.advance(Duration.ofDays(8));
        assertThat(due()).hasSize(1);

        shop("filters", true);
        Instant bought = clock.instant();
        assertThat(due()).isEmpty();
        assertThat(reminders().get(0).lastBoughtAt()).isEqualTo(bought);

        clock.advance(Duration.ofDays(6));
        assertThat(due()).isEmpty();
        clock.advance(Duration.ofDays(1));
        assertThat(due()).hasSize(1);
    }

    @Test
    void somethingBoughtForSomeoneElseDoesNotCount() {
        remind("dog food", 7);
        clock.advance(Duration.ofDays(8));

        shop("dog food", false);

        assertThat(due()).extracting(RestockReminderResponse::name).containsExactly(name("dog food"));
    }

    @Test
    void addingItToTheCupboardByHandStartsTheClockOver() {
        remind("dish soap", 14);
        clock.advance(Duration.ofDays(15));

        cupboardService.add(home, me.getId(), new AddCupboardItemRequest(name("dish soap"), null));

        assertThat(due()).isEmpty();
        assertThat(reminders().get(0).lastBoughtAt()).isEqualTo(clock.instant());
    }

    @Test
    void somethingWaitingOnTheListIsNotAskedAbout() {
        remind("milk", 7);
        clock.advance(Duration.ofDays(7));
        assertThat(due()).hasSize(1);

        GroceryListItemResponse row = add("milk");
        assertThat(due()).isEmpty();
        assertThat(reminders().get(0).due()).isFalse();

        // In the cart is not bought yet — Done shopping is.
        groceryListService.setChecked(home, row.id(), me.getId(), true);
        assertThat(due()).hasSize(1);
    }

    @Test
    void notNowHoldsForThreeDaysUnlessItIsBoughtInBetween() {
        remind("rice", 7);
        clock.advance(Duration.ofDays(7));
        restockService.snooze(home, me.getId(), List.of(ingredientOf("rice")));

        assertThat(due()).isEmpty();
        assertThat(reminders().get(0).snoozedUntil()).isEqualTo(clock.instant().plus(Duration.ofDays(3)));
        clock.advance(Duration.ofDays(3).minusMinutes(1));
        assertThat(due()).isEmpty();
        clock.advance(Duration.ofMinutes(1));
        assertThat(due()).hasSize(1);

        restockService.snooze(home, me.getId(), List.of(ingredientOf("rice")));
        shop("rice", true);
        assertThat(reminders().get(0).snoozedUntil()).isNull();
        clock.advance(Duration.ofDays(7));
        assertThat(due()).hasSize(1);
    }

    @Test
    void addToListAddsTheTickedOnesAndLetsTheRestBe() {
        remind("coffee", 7);
        remind("filters", 7);
        clock.advance(Duration.ofDays(7));
        assertThat(due()).hasSize(2);

        List<GroceryListItemResponse> added = restockService.addDue(home, me.getId(),
                new AddDueRequest(List.of(ingredientOf("coffee")), List.of(ingredientOf("filters"))));

        assertThat(added).extracting(GroceryListItemResponse::name).containsExactly(name("coffee"));
        assertThat(list()).extracting(GroceryListItemResponse::name).containsExactly(name("coffee"));
        assertThat(due()).isEmpty();

        clock.advance(Duration.ofDays(3));
        assertThat(due()).extracting(RestockReminderResponse::name).containsExactly(name("filters"));
    }

    @Test
    void addToListJoinsTheRowAlreadyWaitingAndIgnoresOtherHouses() {
        remind("coffee", 7);
        clock.advance(Duration.ofDays(7));
        // Another phone put it on the list while the question was open.
        groceryListService.addManualItem(home, me.getId(), new AddItemRequest(name("coffee"), new BigDecimal("2"), "bag"));

        User other = userRepository.save(User.builder().username("restock-other-" + tag).displayName("Other").build());
        UUID elsewhere = householdService.create(other.getId(), new CreateHouseholdRequest("Elsewhere")).id();
        UUID theirs = restockService.set(elsewhere, ingredientOf("coffee"), other.getId(), 7).ingredientId();

        restockService.addDue(home, me.getId(), new AddDueRequest(List.of(ingredientOf("coffee"), UUID.randomUUID()), null));
        restockService.addDue(elsewhere, other.getId(), new AddDueRequest(List.of(UUID.randomUUID()), List.of(theirs)));

        assertThat(list()).hasSize(1);
        assertThat(list().get(0).quantity()).isEqualByComparingTo("2");
        assertThat(groceryListService.listItems(elsewhere, other.getId())).isEmpty();
        assertThat(restockService.list(elsewhere, other.getId()).get(0).snoozedUntil()).isNotNull();
    }

    @Test
    void somethingInTheCartIsAddedAgainAsANewRow() {
        remind("coffee", 7);
        clock.advance(Duration.ofDays(7));
        GroceryListItemResponse inCart = add("coffee");
        groceryListService.setChecked(home, inCart.id(), me.getId(), true);

        restockService.addDue(home, me.getId(), new AddDueRequest(List.of(ingredientOf("coffee")), List.of()));

        // The one in the cart is bought already; this asks for the next one.
        assertThat(list()).extracting(GroceryListItemResponse::checked).containsExactlyInAnyOrder(true, false);
    }

    @Test
    void changingHowOftenKeepsTheClock() {
        remind("oats", 28);
        Instant started = clock.instant();
        clock.advance(Duration.ofDays(15));
        assertThat(due()).isEmpty();

        RestockReminderResponse changed = remind("oats", 14);

        assertThat(changed.lastBoughtAt()).isEqualTo(started);
        assertThat(changed.due()).isTrue();
        assertThat(reminders()).hasSize(1);
    }

    @Test
    void turnedOffIsGoneAndTurningItOffTwiceIsFine() {
        remind("tea", 7);
        restockService.delete(home, ingredientOf("tea"), me.getId());
        restockService.delete(home, ingredientOf("tea"), me.getId());
        assertThat(reminders()).isEmpty();
    }

    @Test
    void aCupboardItemRenamedTakesItsReminderWithIt() {
        CupboardItemResponse eggs = cupboardService.add(home, me.getId(), new AddCupboardItemRequest(name("eggs"), null));
        restockService.set(home, eggs.ingredientId(), me.getId(), 7);

        CupboardItemResponse renamed = cupboardService.update(home, eggs.id(), me.getId(),
                new UpdateCupboardItemRequest(null, null, name("large eggs"), null, null, null));

        assertThat(reminders()).extracting(RestockReminderResponse::ingredientId).containsExactly(renamed.ingredientId());
        assertThat(reminders()).extracting(RestockReminderResponse::everyDays).containsExactly(7);
    }

    @Test
    void onlyTheHouseholdCanSeeOrSetItsReminders() {
        remind("coffee", 7);
        User stranger = userRepository.save(User.builder().username("restock-stranger-" + tag).displayName("S").build());

        assertThatThrownBy(() -> restockService.list(home, stranger.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> restockService.due(home, stranger.getId()))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> restockService.set(home, ingredientOf("coffee"), stranger.getId(), 3))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> restockService.snooze(home, stranger.getId(), List.of(ingredientOf("coffee"))))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(reminders().get(0).everyDays()).isEqualTo(7);
    }

    @Test
    void aHouseholdWithRemindersCanStillBeDeleted() {
        remind("coffee", 7);
        assertThat(reminders()).hasSize(1);
        householdService.delete(home, me.getId());
        assertThat(householdService.listForUser(me.getId())).isEmpty();
    }

    // --- Helpers ---

    private String name(String thing) {
        return thing + "-" + tag;
    }

    /** Sets a reminder on something, putting it in the cupboard first so it exists. */
    private RestockReminderResponse remind(String thing, int everyDays) {
        UUID ingredientId = ingredientOrNull(thing);
        if (ingredientId == null) {
            ingredientId = cupboardService.add(home, me.getId(), new AddCupboardItemRequest(name(thing), null)).ingredientId();
        }
        return restockService.set(home, ingredientId, me.getId(), everyDays);
    }

    private UUID ingredientOf(String thing) {
        UUID id = ingredientOrNull(thing);
        assertThat(id).as("ingredient for " + thing).isNotNull();
        return id;
    }

    private UUID ingredientOrNull(String thing) {
        return cupboardService.list(home, me.getId()).stream()
                .filter(c -> c.name().equalsIgnoreCase(name(thing)))
                .map(CupboardItemResponse::ingredientId)
                .findFirst()
                .orElseGet(() -> restockService.list(home, me.getId()).stream()
                        .filter(r -> r.name().equalsIgnoreCase(name(thing)))
                        .map(RestockReminderResponse::ingredientId)
                        .findFirst()
                        .orElse(null));
    }

    private GroceryListItemResponse add(String thing) {
        return groceryListService.addManualItem(home, me.getId(), new AddItemRequest(name(thing), null, null));
    }

    /** On the list, ticked, and Done shopping — put away, or left out as somebody else's. */
    private void shop(String thing, boolean forUs) {
        GroceryListItemResponse row = add(thing);
        groceryListService.setChecked(home, row.id(), me.getId(), true);
        groceryListService.putAway(home, me.getId(), forUs
                ? new PutAwayRequest(List.of(row.id()), List.of())
                : new PutAwayRequest(List.of(), List.of(row.id())));
    }

    private List<RestockReminderResponse> due() {
        return restockService.due(home, me.getId());
    }

    private List<RestockReminderResponse> reminders() {
        return restockService.list(home, me.getId());
    }

    private List<GroceryListItemResponse> list() {
        return groceryListService.listItems(home, me.getId());
    }

    /** A clock that only moves when told to. */
    private static final class MovableClock extends Clock {
        private Instant now;

        MovableClock(Instant start) {
            this.now = start;
        }

        void advance(Duration by) {
            now = now.plus(by);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
