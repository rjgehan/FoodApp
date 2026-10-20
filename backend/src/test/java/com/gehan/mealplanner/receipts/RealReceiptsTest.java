package com.gehan.mealplanner.receipts;

import com.gehan.mealplanner.receipts.ReceiptDtos.DraftLine;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptDraft;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

/**
 * Real receipts, as the phone read them: four shops (three Kings, one ShopRite), each scanned
 * twice, in `resources/receipts`. Only the printed text is kept, and none of the payment or
 * loyalty numbers. These are the receipts the reader was put right against — product codes in
 * front of names, Kings' two price columns and its savings already in the price paid, ShopRite's
 * "You Saved" notes, faded print's misread letters — so every one must come out whole: each thing
 * bought, nothing left unread, and the lines adding up to what the receipt says.
 */
class RealReceiptsTest {

    @ParameterizedTest(name = "{0}")
    @CsvSource({
            "kings-short-1,  Kings Food Markets, 2026-10-19,   5.78,  2",
            "kings-short-2,  Kings Food Markets, 2026-10-19,   5.78,  2",
            "kings-medium-1, Kings Food Markets, 2026-10-17,  82.76, 14",
            "kings-medium-2, Kings Food Markets, 2026-10-17,  82.76, 14",
            "kings-long-1,   Kings Food Markets, 2026-10-17, 166.90, 26",
            "kings-long-2,   Kings Food Markets, 2026-10-17, 166.90, 26",
            "shoprite-1,     ShopRite,           2026-10-19,  52.42, 12",
            "shoprite-2,     ShopRite,           2026-10-19,  52.42, 12",
    })
    void comesOutWhole(String receipt, String shop, LocalDate day, BigDecimal total, int things) throws IOException {
        ReceiptDraft draft = read(receipt);

        assertThat(draft.storeName()).isEqualTo(shop);
        assertThat(draft.purchasedOn()).isEqualTo(day);
        assertThat(draft.total()).isEqualByComparingTo(total);
        assertThat(draft.lines()).hasSize(things);
        assertThat(draft.sumMatches()).isTrue();
        assertThat(draft.unreadLines()).isEmpty();
        // No product code or "Price" column left in a name.
        assertThat(draft.lines()).extracting(DraftLine::text)
                .noneMatch(text -> text.matches("^\\d{4,}.*") || text.matches(".*\\d\\.\\d\\d$"));
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({"kings-long-1", "kings-long-2"})
    void kingsSavingsAreCountedOnceAndWeightsFindTheirItems(String receipt) throws IOException {
        List<DraftLine> lines = read(receipt).lines();
        assertThat(lines).filteredOn(l -> l.text().equals("FILIPPO BERIO"))
                .extracting(DraftLine::price, DraftLine::onSale).containsExactly(tuple(money("6.99"), true));
        assertThat(lines).filteredOn(l -> l.text().equals("CKN THIGHS BONE IN"))
                .extracting(DraftLine::price, DraftLine::onSale).containsExactly(tuple(money("13.44"), true));
        assertThat(lines).filteredOn(l -> l.text().equals("ORGNC GALA APPLES"))
                .extracting(DraftLine::quantity, DraftLine::unit, DraftLine::unitPrice, DraftLine::price)
                .containsExactly(tuple(new BigDecimal("2.25"), "lb", money("3.49"), money("7.85")));
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({"kings-medium-1", "kings-medium-2"})
    void aPriceAlreadyReducedIsNotReducedAgain(String receipt) throws IOException {
        List<DraftLine> lines = read(receipt).lines();
        assertThat(lines).filteredOn(l -> l.text().equals("KIKKOMAN SOY SAUCE"))
                .extracting(DraftLine::price, DraftLine::onSale).containsExactly(tuple(money("3.99"), true));
        assertThat(lines).filteredOn(l -> l.text().equals("TWININGS TEA"))
                .extracting(DraftLine::price).containsExactly(money("3.99"));
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({"shoprite-1", "shoprite-2"})
    void shopRitesYouSavedIsSaidNotTaken(String receipt) throws IOException {
        List<DraftLine> lines = read(receipt).lines();
        // "On Sale You Saved 1.80" under 2.49: on sale, and still 2.49.
        assertThat(lines.get(0)).extracting(DraftLine::price, DraftLine::onSale).containsExactly(money("2.49"), true);
        // "SC … 1.20-F", a store coupon, does come off the granola above it.
        assertThat(lines.get(1)).extracting(DraftLine::price, DraftLine::onSale).containsExactly(money("4.49"), true);
    }

    private static ReceiptDraft read(String receipt) throws IOException {
        try (InputStream in = RealReceiptsTest.class.getResourceAsStream("/receipts/" + receipt + ".txt")) {
            assertThat(in).as(receipt).isNotNull();
            List<String> lines = new String(in.readAllBytes(), StandardCharsets.UTF_8).lines().toList();
            return ReceiptReader.read(lines, List.of(), List.of());
        }
    }

    private static BigDecimal money(String amount) {
        return new BigDecimal(amount);
    }
}
