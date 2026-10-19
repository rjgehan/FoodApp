package com.gehan.mealplanner.receipts;

import com.gehan.mealplanner.domain.HouseholdMember;
import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.GroceryListDtos.AddItemRequest;
import com.gehan.mealplanner.dto.GroceryListDtos.GroceryListItemResponse;
import com.gehan.mealplanner.dto.GroceryListDtos.LastPrice;
import com.gehan.mealplanner.dto.GroceryListDtos.SetPriceRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.realtime.GroceryListEventPublisher;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReadReceiptRequest;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptDraft;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptLineResponse;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptResponse;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptSummary;
import com.gehan.mealplanner.receipts.ReceiptDtos.SaveLine;
import com.gehan.mealplanner.receipts.ReceiptDtos.SaveReceiptRequest;
import com.gehan.mealplanner.receipts.ReceiptDtos.StoreItemPrice;
import com.gehan.mealplanner.receipts.ReceiptDtos.StorePrices;
import com.gehan.mealplanner.receipts.ReceiptDtos.StoreResponse;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.UserRepository;
import com.gehan.mealplanner.service.GroceryListService;
import com.gehan.mealplanner.service.HouseholdService;
import com.gehan.mealplanner.web.ApiExceptionHandler;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verify;

/**
 * Receipts against the real database: a confirmed receipt becomes a price for each line that
 * counts as something, the shop is found by name whatever its case, the same receipt cannot be
 * saved twice, deleting one takes its prices back, the grocery list shows the newest price for
 * each row in one go, a price can be typed in on a row, and nobody outside the house gets near
 * any of it. Rolled back after each test.
 */
@SpringBootTest
@Transactional
class ReceiptsDatabaseTest {

    private static final LocalDate EARLY_OCTOBER = LocalDate.of(2026, 10, 1);
    private static final LocalDate MID_OCTOBER = LocalDate.of(2026, 10, 10);

    @Autowired ReceiptService receiptService;
    @Autowired GroceryListService groceryListService;
    @Autowired HouseholdService householdService;
    @Autowired UserRepository userRepository;
    @Autowired HouseholdRepository householdRepository;
    @Autowired HouseholdMemberRepository memberRepository;
    @Autowired ApiExceptionHandler apiExceptionHandler;
    @Autowired JdbcTemplate jdbc;
    @PersistenceContext EntityManager entityManager;
    /** The real one, still publishing to Redis, watched for what it is asked to send. */
    @MockitoSpyBean GroceryListEventPublisher eventPublisher;

    private User me;
    private UUID home;
    private String tag;

    @BeforeEach
    void household() {
        tag = UUID.randomUUID().toString().substring(0, 8);
        me = userRepository.save(User.builder().username("receipts-" + tag).displayName("Me").build());
        home = householdService.create(me.getId(), new CreateHouseholdRequest("Receipts")).id();
    }

    // --- Saving ---

    @Test
    void savingTurnsEachLineThatCountsAsSomethingIntoAPrice() {
        GroceryListItemResponse spinach = add("spinach-" + tag);

        ReceiptResponse saved = save(receipt("Kings Food Markets", MID_OCTOBER, null,
                line("KNGS BABY SPINACH 5OZ", "3.99", r -> r.ingredientId = spinach.ingredientId()),
                line("LEMONS", "1.87", r -> {
                    r.ingredientName = "lemons-" + tag;
                    r.quantity = "3";
                    r.unitPrice = "0.79";
                    r.onSale = true;
                }),
                line("SOURDOUGH LOAF", "6.50", r -> { }),
                line("PAPER BAG", "0.10", r -> {
                    r.kind = "NOT_FOOD";
                    r.ingredientName = "bag-" + tag;
                })));

        assertThat(saved.storeName()).isEqualTo("Kings Food Markets");
        assertThat(saved.purchasedOn()).isEqualTo(MID_OCTOBER);
        assertThat(saved.itemCount()).isEqualTo(3);
        assertThat(saved.pricedCount()).isEqualTo(2);
        assertThat(saved.lines())
                .extracting(ReceiptLineResponse::text, ReceiptLineResponse::kind, ReceiptLineResponse::ingredientName)
                .containsExactly(
                        tuple("KNGS BABY SPINACH 5OZ", "ITEM", "spinach-" + tag),
                        tuple("LEMONS", "ITEM", "lemons-" + tag),
                        tuple("SOURDOUGH LOAF", "ITEM", null),
                        // Not food prices nothing, whatever name came with it.
                        tuple("PAPER BAG", "NOT_FOOD", null));

        List<Map<String, Object>> prices = jdbc.queryForList("""
                SELECT i.name, o.price, o.quantity, o.on_sale, o.observed_on, o.source, o.store_id, o.receipt_line_id
                FROM price_observations o
                JOIN ingredients i ON i.id = o.ingredient_id
                WHERE o.household_id = ? ORDER BY i.name
                """, home);
        assertThat(prices).extracting(p -> p.get("name"), p -> ((BigDecimal) p.get("price")).toPlainString(),
                        p -> p.get("on_sale"), p -> p.get("source"))
                .containsExactly(
                        tuple("lemons-" + tag, "1.87", true, "RECEIPT"),
                        tuple("spinach-" + tag, "3.99", false, "RECEIPT"));
        assertThat(prices).allSatisfy(p -> {
            assertThat(p.get("observed_on").toString()).isEqualTo("2026-10-10");
            assertThat(p.get("store_id")).isEqualTo(saved.storeId());
            assertThat(p.get("receipt_line_id")).isNotNull();
        });
        assertThat(((BigDecimal) prices.get(0).get("quantity"))).isEqualByComparingTo("3");
    }

    @Test
    void aReceiptWithNoDayIsPricedToday() {
        GroceryListItemResponse milk = add("milk-" + tag);
        save(receipt("Kings Food Markets", null, null, line("WHOLE MILK", "4.49", r -> r.ingredientId = milk.ingredientId())));
        assertThat(lastPrice(milk).observedOn()).isEqualTo(LocalDate.now());
    }

    @Test
    void theShopIsFoundByNameWhateverItsCase() {
        ReceiptResponse first = save(receipt("Kings Food Markets", MID_OCTOBER, null, line("BREAD", "4.00", r -> { })));
        ReceiptResponse second = save(receipt("  KINGS   FOOD MARKETS ", MID_OCTOBER, null, line("BREAD", "4.00", r -> { })));
        ReceiptResponse nowhere = save(receipt(" ", MID_OCTOBER, null, line("BREAD", "4.00", r -> { })));

        assertThat(second.storeId()).isEqualTo(first.storeId());
        assertThat(second.storeName()).isEqualTo("Kings Food Markets");
        assertThat(nowhere.storeName()).isNull();
        assertThat(receiptService.stores(home, me.getId()))
                .extracting(StoreResponse::name).containsExactly("Kings Food Markets");
    }

    @Test
    void aTypedNameIsFoundOrMadeLikeOneTypedOnTheList() {
        GroceryListItemResponse onList = add("Basil-" + tag);
        ReceiptResponse saved = save(receipt("Kings Food Markets", MID_OCTOBER, null,
                line("BASIL", "2.99", r -> r.ingredientName = "basil-" + tag)));
        assertThat(saved.lines().get(0).ingredientId()).isEqualTo(onList.ingredientId());
    }

    @Test
    void theSameReceiptCannotBeSavedTwice() {
        String barcode = "9912345" + tag;
        ReceiptResponse first = save(receipt("Kings Food Markets", MID_OCTOBER, barcode, line("BREAD", "4.00", r -> { })));

        assertThatThrownBy(() -> save(receipt("Kings Food Markets", MID_OCTOBER, barcode, line("BREAD", "4.00", r -> { }))))
                .isInstanceOfSatisfying(DuplicateReceiptException.class, e -> {
                    assertThat(e.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(e.getDuplicateOf()).isEqualTo(first.id());
                    ResponseEntity<Map<String, Object>> body = apiExceptionHandler.handleDuplicateReceipt(e);
                    assertThat(body.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(body.getBody()).containsEntry("duplicateOf", first.id())
                            .containsEntry("message", "You've already saved this receipt.");
                });

        // Reading it again says so before anybody checks a line.
        ReceiptDraft draft = receiptService.read(home, me.getId(), new ReadReceiptRequest(List.of("BREAD 4.00"), barcode));
        assertThat(draft.duplicateOf()).isEqualTo(first.id());
        assertThat(receiptService.read(home, me.getId(), new ReadReceiptRequest(List.of("BREAD 4.00"), "other-" + tag))
                .duplicateOf()).isNull();

        // "Save anyway" saves it without the barcode; another house's same barcode is its own business.
        save(receipt("Kings Food Markets", MID_OCTOBER, null, line("BREAD", "4.00", r -> { })));
        User neighbour = userRepository.save(User.builder().username("neighbour-" + tag).displayName("N").build());
        UUID next = householdService.create(neighbour.getId(), new CreateHouseholdRequest("Next door")).id();
        receiptService.save(next, neighbour.getId(),
                receipt("Kings Food Markets", MID_OCTOBER, barcode, line("BREAD", "4.00", r -> { })));
        assertThat(receiptService.list(home, me.getId())).hasSize(2);
    }

    @Test
    void aLineIsEitherFoodOrNot() {
        assertThatThrownBy(() -> save(receipt("Kings", MID_OCTOBER, null, line("BREAD", "4.00", r -> r.kind = "SNACK"))))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        assertThatThrownBy(() -> save(receipt("Kings", MID_OCTOBER, null,
                line("BREAD", "4.00", r -> r.ingredientId = UUID.randomUUID()))))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getReason()).contains("Pick it again"));
    }

    // --- Reading ---

    @Test
    void readingGuessesFromTheHouseholdsOwnAndSavesNothing() {
        // Plain names, since the guess compares words: the household's list holds these two.
        GroceryListItemResponse spinach = add("baby spinach");
        add("whole milk");
        ReceiptResponse before = save(receipt("Kings Food Markets", MID_OCTOBER, null, line("BREAD", "4.00", r -> { })));

        ReceiptDraft draft = receiptService.read(home, me.getId(), new ReadReceiptRequest(List.of(
                "KINGS FOOD MARKETS", "KNGS BABY SPINACH 5OZ 3.99 F", "KNGS WHOLE MILK GAL 4.49 F", "SUBTOTAL 8.48",
                "TOTAL 8.48"), null));

        assertThat(draft.storeName()).isEqualTo("Kings Food Markets");
        assertThat(draft.storeId()).isEqualTo(before.storeId());
        assertThat(draft.sumMatches()).isTrue();
        assertThat(draft.lines().get(0).ingredientId()).isEqualTo(spinach.ingredientId());
        assertThat(draft.lines().get(1).ingredientName()).isEqualTo("whole milk");
        assertThat(receiptService.list(home, me.getId())).hasSize(1);
    }

    // --- Listing and deleting ---

    @Test
    void theListIsNewestShoppingFirstWithItsCounts() {
        GroceryListItemResponse eggs = add("eggs-" + tag);
        save(receipt("Kings Food Markets", EARLY_OCTOBER, null, line("BREAD", "4.00", r -> { })));
        ReceiptResponse later = save(receipt("Corner Shop", MID_OCTOBER, null,
                line("EGGS", "5.29", r -> r.ingredientId = eggs.ingredientId()),
                line("BAG", "0.10", r -> r.kind = "NOT_FOOD")));

        List<ReceiptSummary> listed = receiptService.list(home, me.getId());
        assertThat(listed).extracting(ReceiptSummary::storeName, ReceiptSummary::purchasedOn,
                        ReceiptSummary::itemCount, ReceiptSummary::pricedCount)
                .containsExactly(tuple("Corner Shop", MID_OCTOBER, 1, 1), tuple("Kings Food Markets", EARLY_OCTOBER, 1, 0));
        assertThat(listed.get(0).id()).isEqualTo(later.id());
        assertThat(listed.get(0).total()).isEqualByComparingTo("5.39");
        assertThat(receiptService.get(home, later.id(), me.getId()).lines()).hasSize(2);
    }

    @Test
    void deletingAReceiptTakesItsLinesAndPricesWithIt() {
        GroceryListItemResponse eggs = add("eggs-" + tag);
        ReceiptResponse older = save(receipt("Kings Food Markets", EARLY_OCTOBER, null,
                line("EGGS", "4.99", r -> r.ingredientId = eggs.ingredientId())));
        ReceiptResponse newer = save(receipt("Kings Food Markets", MID_OCTOBER, null,
                line("EGGS", "5.29", r -> r.ingredientId = eggs.ingredientId())));
        assertThat(lastPrice(eggs).price()).isEqualByComparingTo("5.29");
        clearInvocations(eventPublisher);

        receiptService.delete(home, newer.id(), me.getId());
        entityManager.flush();

        assertThat(count("receipt_lines WHERE receipt_id = ?", newer.id())).isZero();
        assertThat(count("receipts WHERE id = ?", newer.id())).isZero();
        assertThat(count("price_observations WHERE household_id = ?", home)).isEqualTo(1);
        // The row shows the price before it, on every phone.
        assertThat(lastPrice(eggs).price()).isEqualByComparingTo("4.99");
        ArgumentCaptor<GroceryListItemResponse> sent = ArgumentCaptor.forClass(GroceryListItemResponse.class);
        verify(eventPublisher, atLeastOnce()).itemChanged(eq(home), sent.capture());
        assertThat(sent.getValue().lastPrice().price()).isEqualByComparingTo("4.99");

        assertThatThrownBy(() -> receiptService.get(home, newer.id(), me.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
        assertThat(receiptService.list(home, me.getId())).extracting(ReceiptSummary::id).containsExactly(older.id());
    }

    // --- Prices on the grocery list ---

    @Test
    void theListShowsTheNewestPriceAndNothingForWhatWasNeverPriced() {
        GroceryListItemResponse spinach = add("spinach-" + tag);
        GroceryListItemResponse never = add("saffron-" + tag);
        GroceryListItemResponse untyped = groceryListService.addManualItem(home, me.getId(), new AddItemRequest(null, null, null));

        save(receipt("Kings Food Markets", MID_OCTOBER, null, line("SPINACH", "2.99", r -> {
            r.ingredientId = spinach.ingredientId();
            r.onSale = true;
        })));
        // Scanned afterwards, but shopped earlier: the day decides, not the order they were saved in.
        save(receipt("Corner Shop", EARLY_OCTOBER, null, line("SPINACH", "3.49", r -> r.ingredientId = spinach.ingredientId())));

        LastPrice price = lastPrice(spinach);
        assertThat(price).isEqualTo(new LastPrice(new BigDecimal("2.99"), null, null, "Kings Food Markets", MID_OCTOBER,
                true, "RECEIPT"));
        assertThat(lastPrice(never)).isNull();
        assertThat(find(untyped.id()).lastPrice()).isNull();

        // Typed in today beats them both.
        groceryListService.setPrice(home, spinach.id(), me.getId(),
                new SetPriceRequest(new BigDecimal("3.29"), new BigDecimal("1"), "bag", "Whole Foods"));
        assertThat(lastPrice(spinach)).isEqualTo(new LastPrice(new BigDecimal("3.29"), new BigDecimal("1.000"), "bag",
                "Whole Foods", LocalDate.now(), false, "MANUAL"));
    }

    @Test
    void theItemSheetShowsWhatItLastCostAtEachShopNewestFirst() {
        GroceryListItemResponse milk = add("milk-" + tag);
        GroceryListItemResponse never = add("saffron-" + tag);

        save(receipt("Kings Food Markets", EARLY_OCTOBER, null, line("MILK", "4.29", r -> r.ingredientId = milk.ingredientId())));
        save(receipt("Kings Food Markets", MID_OCTOBER, null, line("MILK", "4.49", r -> r.ingredientId = milk.ingredientId())));
        save(receipt("ShopRite", EARLY_OCTOBER, null, line("MILK", "3.99", r -> {
            r.ingredientId = milk.ingredientId();
            r.onSale = true;
        })));
        // Typed in with no shop: one more "shop" of its own, not hidden.
        groceryListService.setPrice(home, milk.id(), me.getId(), new SetPriceRequest(new BigDecimal("4.19"), null, null, null));

        assertThat(receiptService.pricesByStore(home, milk.ingredientId(), me.getId()))
                .extracting(LastPrice::storeName, LastPrice::price, LastPrice::observedOn, LastPrice::onSale)
                .containsExactly(
                        tuple(null, new BigDecimal("4.19"), LocalDate.now(), false),
                        tuple("Kings Food Markets", new BigDecimal("4.49"), MID_OCTOBER, false),
                        tuple("ShopRite", new BigDecimal("3.99"), EARLY_OCTOBER, true));
        assertThat(receiptService.pricesByStore(home, never.ingredientId(), me.getId())).isEmpty();

        User stranger = userRepository.save(User.builder().username("stranger-" + tag).displayName("S").build());
        assertThatThrownBy(() -> receiptService.pricesByStore(home, milk.ingredientId(), stranger.getId()))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void theStoreMapPoolsEveryHouseholdsPricesByChainAndPricesTheAskersListThere() {
        GroceryListItemResponse milk = add("milk-" + tag);
        GroceryListItemResponse eggs = add("eggs-" + tag);
        GroceryListItemResponse bread = add("bread-" + tag);
        GroceryListItemResponse butter = add("butter-" + tag);
        add("saffron-" + tag);
        User them = userRepository.save(User.builder().username("neighbour-" + tag).displayName("N").build());
        UUID theirs = householdService.create(them.getId(), new CreateHouseholdRequest("Neighbours")).id();
        // Names unique to this test: the database is shared, and the map is the whole server's.
        String shop = "Shop" + tag;
        String corner = "Corner" + tag;

        save(receipt(shop + " Food Markets", EARLY_OCTOBER, null,
                line("MILK", "4.29", r -> r.ingredientId = milk.ingredientId()),
                line("EGGS", "5.99", r -> r.ingredientId = eggs.ingredientId())));
        // Another household, the same chain spelled its own way, and newer milk.
        receiptService.save(theirs, them.getId(), receipt(shop.toUpperCase() + " FOODS of Hoboken", MID_OCTOBER, null,
                line("MILK", "4.49", r -> r.ingredientId = milk.ingredientId())));
        // A chain only they shop at.
        receiptService.save(theirs, them.getId(), receipt(corner + " Store", EARLY_OCTOBER, null,
                line("BREAD", "2.50", r -> {
                    r.ingredientId = bread.ingredientId();
                    r.onSale = true;
                }),
                line("BUTTER", "3.79", r -> r.ingredientId = butter.ingredientId())));
        // Typed in with no shop: no chain's price.
        groceryListService.setPrice(home, eggs.id(), me.getId(), new SetPriceRequest(new BigDecimal("3.00"), null, null, null));
        // Bought already: no longer to buy, at any chain.
        groceryListService.setChecked(home, butter.id(), me.getId(), true);

        List<StorePrices> chains = receiptService.storePrices(home, me.getId()).stream()
                .filter(c -> c.name().toLowerCase().contains(tag)).toList();

        // Priced most lately first; ours named as we name it, theirs as they do.
        assertThat(chains)
                .extracting(StorePrices::name, StorePrices::lastPricedOn, StorePrices::listPriced, StorePrices::listCount,
                        StorePrices::households, StorePrices::yours)
                .containsExactly(
                        tuple(shop + " Food Markets", MID_OCTOBER, 2, 4, 2, true),
                        tuple(corner + " Store", EARLY_OCTOBER, 1, 4, 1, false));
        assertThat(chains.get(0).listTotal()).isEqualByComparingTo("10.48");
        assertThat(chains.get(1).listTotal()).isEqualByComparingTo("2.50");
        // The newest price for each thing whoever paid it, A to Z, and only "yours" said of whose.
        assertThat(chains.get(0).prices())
                .extracting(StoreItemPrice::ingredientName, StoreItemPrice::price, StoreItemPrice::observedOn,
                        StoreItemPrice::yours)
                .containsExactly(
                        tuple("eggs-" + tag, new BigDecimal("5.99"), EARLY_OCTOBER, true),
                        tuple("milk-" + tag, new BigDecimal("4.49"), MID_OCTOBER, false));
        assertThat(chains.get(1).prices())
                .extracting(StoreItemPrice::ingredientName, StoreItemPrice::onSale, StoreItemPrice::yours)
                .containsExactly(tuple("bread-" + tag, true, false), tuple("butter-" + tag, false, false));
        // The same chain is the same id however it is asked for.
        assertThat(receiptService.storePrices(theirs, them.getId()).stream()
                .filter(c -> c.id().equals(chains.get(0).id())).findFirst().orElseThrow().name())
                .isEqualTo(shop.toUpperCase() + " FOODS of Hoboken");

        User stranger = userRepository.save(User.builder().username("stranger-" + tag).displayName("S").build());
        assertThatThrownBy(() -> receiptService.storePrices(home, stranger.getId()))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void aTypedPriceIsSentToTheOtherPhonesAndNeedsAThingToBeFor() {
        GroceryListItemResponse coffee = add("coffee-" + tag);
        clearInvocations(eventPublisher);

        GroceryListItemResponse priced = groceryListService.setPrice(home, coffee.id(), me.getId(),
                new SetPriceRequest(new BigDecimal("11.99"), null, " ", null));

        assertThat(priced.lastPrice()).isEqualTo(new LastPrice(new BigDecimal("11.99"), null, null, null, LocalDate.now(),
                false, "MANUAL"));
        verify(eventPublisher).itemChanged(home, priced);
        assertThat(receiptService.stores(home, me.getId())).isEmpty();

        GroceryListItemResponse nameless = groceryListService.addManualItem(home, me.getId(), new AddItemRequest(null, null, null));
        assertThatThrownBy(() -> groceryListService.setPrice(home, nameless.id(), me.getId(),
                new SetPriceRequest(new BigDecimal("1.00"), null, null, null)))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void savingAReceiptSendsTheRowsItPricedToTheOtherPhones() {
        GroceryListItemResponse butter = add("butter-" + tag);
        add("jam-" + tag);
        clearInvocations(eventPublisher);

        save(receipt("Kings Food Markets", MID_OCTOBER, null,
                line("BUTTER", "4.99", r -> r.ingredientId = butter.ingredientId())));

        ArgumentCaptor<GroceryListItemResponse> sent = ArgumentCaptor.forClass(GroceryListItemResponse.class);
        verify(eventPublisher).itemChanged(eq(home), sent.capture());
        assertThat(sent.getValue().id()).isEqualTo(butter.id());
        assertThat(sent.getValue().lastPrice().price()).isEqualByComparingTo("4.99");
    }

    // --- Who may ---

    @Test
    void nobodyOutsideTheHouseGetsNearItsReceiptsOrPrices() {
        GroceryListItemResponse eggs = add("eggs-" + tag);
        ReceiptResponse ours = save(receipt("Kings Food Markets", MID_OCTOBER, null,
                line("EGGS", "4.99", r -> r.ingredientId = eggs.ingredientId())));
        User outsider = userRepository.save(User.builder().username("outsider-" + tag).displayName("O").build());
        UUID theirs = householdService.create(outsider.getId(), new CreateHouseholdRequest("Theirs")).id();
        UUID them = outsider.getId();

        List<Runnable> attempts = List.of(
                () -> receiptService.read(home, them, new ReadReceiptRequest(List.of("BREAD 4.00"), null)),
                () -> receiptService.save(home, them, receipt("X", MID_OCTOBER, null, line("BREAD", "4.00", r -> { }))),
                () -> receiptService.list(home, them),
                () -> receiptService.get(home, ours.id(), them),
                () -> receiptService.delete(home, ours.id(), them),
                () -> receiptService.stores(home, them),
                () -> groceryListService.setPrice(home, eggs.id(), them, new SetPriceRequest(BigDecimal.ONE, null, null, null)));
        for (Runnable attempt : attempts) {
            assertThatThrownBy(attempt::run).isInstanceOfSatisfying(ResponseStatusException.class,
                    e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        }
        // Through their own house's address, ours is not there to be found.
        assertThatThrownBy(() -> receiptService.get(theirs, ours.id(), them))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
        assertThatThrownBy(() -> receiptService.delete(theirs, ours.id(), them))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
        assertThatThrownBy(() -> groceryListService.setPrice(theirs, eggs.id(), them,
                new SetPriceRequest(BigDecimal.ONE, null, null, null)))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));

        assertThat(receiptService.list(home, me.getId())).hasSize(1);
        assertThat(lastPrice(eggs).price()).isEqualByComparingTo("4.99");
    }

    // --- Going away ---

    @Test
    void deletingTheHouseholdTakesItsReceiptsPricesAndShops() {
        GroceryListItemResponse eggs = add("eggs-" + tag);
        ReceiptResponse saved = save(receipt("Kings Food Markets", MID_OCTOBER, "bc-" + tag,
                line("EGGS", "4.99", r -> r.ingredientId = eggs.ingredientId()),
                line("SOMETHING", "1.00", r -> { })));
        groceryListService.setPrice(home, eggs.id(), me.getId(), new SetPriceRequest(new BigDecimal("5.10"), null, null, "Corner"));
        entityManager.flush();

        householdService.delete(home, me.getId());
        entityManager.flush();
        entityManager.clear();

        assertThat(count("households WHERE id = ?", home)).isZero();
        assertThat(count("stores WHERE household_id = ?", home)).isZero();
        assertThat(count("receipts WHERE household_id = ?", home)).isZero();
        assertThat(count("price_observations WHERE household_id = ?", home)).isZero();
        assertThat(count("receipt_lines WHERE receipt_id = ?", saved.id())).isZero();
    }

    @Test
    void anAccountThatScannedReceiptsInAHouseItOnlyLeavesCanStillBeDeleted() {
        User member = userRepository.save(User.builder().username("scanner-" + tag).displayName("Scanner").build());
        memberRepository.save(HouseholdMember.builder()
                .household(householdRepository.findById(home).orElseThrow())
                .user(member)
                .role(HouseholdRole.MEMBER)
                .build());
        GroceryListItemResponse eggs = add("eggs-" + tag);
        receiptService.save(home, member.getId(), receipt("Kings Food Markets", MID_OCTOBER, null,
                line("EGGS", "4.99", r -> r.ingredientId = eggs.ingredientId())));
        groceryListService.setPrice(home, eggs.id(), member.getId(), new SetPriceRequest(new BigDecimal("5.10"), null, null, null));
        entityManager.flush();

        householdService.deleteAccount(member.getId());
        entityManager.flush();
        entityManager.clear();

        assertThat(userRepository.findById(member.getId())).isEmpty();
        // The house keeps what they taught it.
        assertThat(receiptService.list(home, me.getId())).hasSize(1);
        assertThat(count("price_observations WHERE household_id = ?", home)).isEqualTo(2);
    }

    // --- Helpers ---

    /** A line as the review screen sends it; the consumer fills in what this test cares about. */
    private static final class LineBuilder {
        String text;
        String kind = "ITEM";
        String quantity;
        String unitPrice;
        String price;
        boolean onSale;
        UUID ingredientId;
        String ingredientName;
    }

    private static SaveLine line(String text, String price, Consumer<LineBuilder> details) {
        LineBuilder b = new LineBuilder();
        b.text = text;
        b.price = price;
        details.accept(b);
        return new SaveLine(b.text, b.kind, b.quantity == null ? null : new BigDecimal(b.quantity), null,
                b.unitPrice == null ? null : new BigDecimal(b.unitPrice), new BigDecimal(b.price), b.onSale,
                b.ingredientId, b.ingredientName);
    }

    private static SaveReceiptRequest receipt(String store, LocalDate on, String barcode, SaveLine... lines) {
        BigDecimal total = Arrays.stream(lines).map(SaveLine::price).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new SaveReceiptRequest(store, on, total, BigDecimal.ZERO, total, barcode, "raw text", List.of(lines));
    }

    private ReceiptResponse save(SaveReceiptRequest request) {
        return receiptService.save(home, me.getId(), request);
    }

    private GroceryListItemResponse add(String name) {
        return groceryListService.addManualItem(home, me.getId(), new AddItemRequest(name, null, null));
    }

    private GroceryListItemResponse find(UUID itemId) {
        return groceryListService.listItems(home, me.getId()).stream()
                .filter(i -> i.id().equals(itemId)).findFirst().orElseThrow();
    }

    private LastPrice lastPrice(GroceryListItemResponse item) {
        return find(item.id()).lastPrice();
    }

    private long count(String fromWhere, Object... args) {
        return jdbc.queryForObject("SELECT count(*) FROM " + fromWhere, Long.class, args);
    }
}
