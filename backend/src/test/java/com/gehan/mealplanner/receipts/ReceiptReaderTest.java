package com.gehan.mealplanner.receipts;

import com.gehan.mealplanner.receipts.ReceiptDtos.DraftLine;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptDraft;
import com.gehan.mealplanner.receipts.ReceiptReader.KnownIngredient;
import com.gehan.mealplanner.receipts.ReceiptReader.KnownStore;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;

/**
 * Reading till receipts, line by line, the way the phone sends them: one row of text per line,
 * the words on a row joined by a space. Three whole receipts first — two Kings ones, the shop the
 * reader was written for, and one from a smaller shop that prints things its own way — then each
 * rule on its own, with the traps real receipts set: a yogurt called TOTAL, McCormick printed as
 * MC, a coupon with nothing above it, savings summaries under the total.
 */
class ReceiptReaderTest {

    private static final KnownIngredient BABY_SPINACH = known("baby spinach");
    private static final KnownIngredient SPINACH = known("spinach");
    private static final KnownIngredient BANANAS = known("bananas");
    private static final KnownIngredient LEMON = known("lemon");
    private static final KnownIngredient GREEK_YOGURT = known("Greek yogurt");
    private static final KnownIngredient MILK = known("milk");
    private static final KnownIngredient WHOLE_WHEAT_BREAD = known("whole wheat bread");
    private static final KnownIngredient APPLES = known("apples");
    private static final KnownIngredient PASTA = known("pasta");
    private static final KnownIngredient PASTA_SAUCE = known("pasta sauce");
    private static final KnownIngredient SPAGHETTI = known("spaghetti");
    private static final KnownIngredient CHICKEN_THIGHS = known("chicken thighs");
    private static final KnownIngredient CHICKEN_BROTH = known("chicken broth");
    private static final KnownIngredient LARGE_EGGS = known("large eggs");
    private static final KnownIngredient TOMATOES = known("tomatoes");

    private static final List<KnownIngredient> PANTRY = List.of(BABY_SPINACH, SPINACH, BANANAS, LEMON, GREEK_YOGURT,
            MILK, WHOLE_WHEAT_BREAD, APPLES, PASTA, PASTA_SAUCE, SPAGHETTI, CHICKEN_THIGHS, CHICKEN_BROTH, LARGE_EGGS,
            TOMATOES);

    private static KnownIngredient known(String name) {
        return new KnownIngredient(UUID.randomUUID(), name);
    }

    private static ReceiptDraft read(String... lines) {
        return ReceiptReader.read(Arrays.asList(lines), PANTRY, List.of());
    }

    private static BigDecimal money(String amount) {
        return new BigDecimal(amount);
    }

    // --- Whole receipts ---

    /** A Saturday shop at Kings: weighed bananas, a counted bag of lemons with a card saving, a bag and a deposit. */
    private static final List<String> KINGS_SATURDAY = List.of(
            "KINGS",
            "FOOD MARKETS",
            "1 Hudson Pl",
            "Hoboken, NJ 07030",
            "(201) 555-0142",
            "ST 0412 OP 23 TE 04 TR 5531",
            "",
            "KNGS BABY SPINACH 5OZ 3.99 F",
            "ORGANIC BANANAS",
            "2.04 lb @ 0.69 /lb 1.41 F",
            "LEMONS",
            "3 @ 0.79 2.37 F",
            "SC KINGS CARD SAVINGS 0.50-",
            "CHOBANI GREEK YOGURT 1.79 F",
            "CHOBANI GREEK YOGURT 1.79 F",
            "WHOLE MILK GAL 4.49 F",
            "PAPER BAG 0.10 T",
            "BTL DEP .05",
            "SUBTOTAL 15.49",
            "NJ SALES TAX 6.625% 0.01",
            "**** BALANCE 15.50",
            "VISA 15.50",
            "CARD # ************4821",
            "AUTH 004512 APPROVED",
            "CHANGE 0.00",
            "YOUR CARD SAVINGS TODAY 0.50",
            "10/18/26 5:42 PM",
            "THANK YOU FOR SHOPPING KINGS");

    @Test
    void readsAKingsReceiptFromTopToBottom() {
        ReceiptDraft draft = ReceiptReader.read(KINGS_SATURDAY, PANTRY, List.of());

        assertThat(draft.storeName()).isEqualTo("Kings Food Markets");
        assertThat(draft.storeId()).isNull();
        assertThat(draft.purchasedOn()).isEqualTo(LocalDate.of(2026, 10, 18));
        assertThat(draft.subtotal()).isEqualByComparingTo("15.49");
        assertThat(draft.tax()).isEqualByComparingTo("0.01");
        assertThat(draft.total()).isEqualByComparingTo("15.50");
        assertThat(draft.sumMatches()).isTrue();
        assertThat(draft.duplicateOf()).isNull();
        assertThat(draft.unreadLines()).isEmpty();

        assertThat(draft.lines())
                .extracting(DraftLine::text, DraftLine::kind, DraftLine::price, DraftLine::onSale, DraftLine::ingredientName)
                .containsExactly(
                        tuple("KNGS BABY SPINACH 5OZ", "ITEM", money("3.99"), false, "baby spinach"),
                        tuple("ORGANIC BANANAS", "ITEM", money("1.41"), false, "bananas"),
                        tuple("LEMONS", "ITEM", money("1.87"), true, "lemon"),
                        tuple("CHOBANI GREEK YOGURT", "ITEM", money("1.79"), false, "Greek yogurt"),
                        tuple("CHOBANI GREEK YOGURT", "ITEM", money("1.79"), false, "Greek yogurt"),
                        tuple("WHOLE MILK GAL", "ITEM", money("4.49"), false, "milk"),
                        tuple("PAPER BAG", "NOT_FOOD", money("0.10"), false, null),
                        tuple("BTL DEP", "NOT_FOOD", money("0.05"), false, null));

        DraftLine bananas = draft.lines().get(1);
        assertThat(bananas.quantity()).isEqualByComparingTo("2.04");
        assertThat(bananas.unit()).isEqualTo("lb");
        assertThat(bananas.unitPrice()).isEqualByComparingTo("0.69");
        assertThat(bananas.ingredientId()).isEqualTo(BANANAS.id());
        DraftLine lemons = draft.lines().get(2);
        assertThat(lemons.quantity()).isEqualByComparingTo("3");
        assertThat(lemons.unit()).isNull();
        assertThat(lemons.unitPrice()).isEqualByComparingTo("0.79");
    }

    /**
     * Another Kings shop, printed the other way round: the weight above the apples, a two-for
     * deal, a price reduction and a manufacturer's coupon, a weight under the chicken it adds up
     * to, and a line nobody could read — which is why the lines do not add up to the subtotal.
     */
    private static final List<String> KINGS_SUNDAY = List.of(
            "Kings Food Markets",
            "Welcome to Kings Hoboken",
            "2026-10-11 10:03",
            "1.32 lb @ 2.99 /lb",
            "GALA APPLES 3.95 F",
            "KNGS PASTA SAUCE 24OZ",
            "2 @ 2/5.00 5.00 F",
            "BARILLA SPAGHETTI 16OZ 1.99 F",
            "PRICE REDUCTION -1.00",
            "CHICKEN THIGHS BNLS 8.47 F",
            "1.52 lb @ $5.57/lb",
            "PARMIGIANO REGGIANO 9.99 TF",
            "MFR COUPON 1.00",
            "#4011 ??? 0.89",
            "SUB TOTAL 28.29",
            "TAX 0.00",
            "TOTAL 28.29",
            "CASH 30.00",
            "CHANGE 0.71");

    @Test
    void readsAKingsReceiptPrintedTheOtherWayRound() {
        ReceiptDraft draft = ReceiptReader.read(KINGS_SUNDAY, PANTRY, List.of());

        assertThat(draft.storeName()).isEqualTo("Kings Food Markets");
        assertThat(draft.purchasedOn()).isEqualTo(LocalDate.of(2026, 10, 11));
        assertThat(draft.subtotal()).isEqualByComparingTo("28.29");
        assertThat(draft.tax()).isEqualByComparingTo("0.00");
        assertThat(draft.total()).isEqualByComparingTo("28.29");
        // 27.40 read, 28.29 printed: the 0.89 nobody could read.
        assertThat(draft.sumMatches()).isFalse();
        assertThat(draft.unreadLines()).containsExactly("#4011 ??? 0.89");

        assertThat(draft.lines())
                .extracting(DraftLine::text, DraftLine::quantity, DraftLine::unit, DraftLine::unitPrice, DraftLine::price,
                        DraftLine::onSale, DraftLine::ingredientId)
                .containsExactly(
                        tuple("GALA APPLES", money("1.32"), "lb", money("2.99"), money("3.95"), false, APPLES.id()),
                        tuple("KNGS PASTA SAUCE 24OZ", money("2"), null, money("2.50"), money("5.00"), false,
                                PASTA_SAUCE.id()),
                        // Nothing weighed or counted: the size in its name is how much it was.
                        tuple("BARILLA SPAGHETTI 16OZ", money("16"), "oz", null, money("0.99"), true, SPAGHETTI.id()),
                        tuple("CHICKEN THIGHS BNLS", money("1.52"), "lb", money("5.57"), money("8.47"), false,
                                CHICKEN_THIGHS.id()),
                        tuple("PARMIGIANO REGGIANO", null, null, null, money("8.99"), true, null));
    }

    /**
     * A small shop's receipt: its name in capitals at the top, a weight with no unit, a price on
     * the row under its name, a VOID marker between the items, and a gift card.
     */
    private static final List<String> CORNER_SHOP = List.of(
            "HOBOKEN FARMERS PANTRY",
            "123 Washington St",
            "Tel 201-555-0199",
            "Cashier: Maria",
            "10/04/2026 18:22",
            "TOMATOES ON VINE",
            "1.32 @ 2.99 3.95",
            "SOURDOUGH LOAF",
            "6.50",
            "** VOID **",
            "EGGS LARGE 12CT 5.29 *",
            "GIFT CARD 25.00",
            "SUBTOTAL 40.74",
            "TOTAL 40.74",
            "DEBIT 40.74",
            "Thank you, come again!");

    @Test
    void readsASmallShopsReceiptAndKnowsTheShop() {
        UUID pantryId = UUID.randomUUID();
        ReceiptDraft draft = ReceiptReader.read(CORNER_SHOP, PANTRY,
                List.of(new KnownStore(UUID.randomUUID(), "Kings Food Markets"),
                        new KnownStore(pantryId, "Hoboken Farmers Pantry")));

        assertThat(draft.storeName()).isEqualTo("Hoboken Farmers Pantry");
        assertThat(draft.storeId()).isEqualTo(pantryId);
        assertThat(draft.purchasedOn()).isEqualTo(LocalDate.of(2026, 10, 4));
        assertThat(draft.tax()).isNull();
        assertThat(draft.sumMatches()).isTrue();
        assertThat(draft.unreadLines()).containsExactly("** VOID **");
        assertThat(draft.lines())
                .extracting(DraftLine::text, DraftLine::kind, DraftLine::price, DraftLine::ingredientName)
                .containsExactly(
                        tuple("TOMATOES ON VINE", "ITEM", money("3.95"), "tomatoes"),
                        tuple("SOURDOUGH LOAF", "ITEM", money("6.50"), null),
                        tuple("EGGS LARGE 12CT", "ITEM", money("5.29"), "large eggs"),
                        tuple("GIFT CARD", "NOT_FOOD", money("25.00"), null));
        // No unit with a weight that is not a whole number: pounds, at a US till.
        assertThat(draft.lines().get(0).unit()).isEqualTo("lb");
        assertThat(draft.lines().get(0).quantity()).isEqualByComparingTo("1.32");
    }

    // --- Weights and counts ---

    @Test
    void aPackSizeInTheNameIsWhatThePriceWasFor() {
        assertThat(ReceiptReader.packSize("KNGS BABY SPINACH 5OZ")).contains(new ReceiptReader.PackSize(new BigDecimal("5"), "oz"));
        assertThat(ReceiptReader.packSize("OLIVE OIL 16.9 FL OZ"))
                .contains(new ReceiptReader.PackSize(new BigDecimal("16.9"), "fl oz"));
        assertThat(ReceiptReader.packSize("TWININGS ENG BRKFST 20CT"))
                .contains(new ReceiptReader.PackSize(new BigDecimal("20"), "ct"));
        assertThat(ReceiptReader.packSize("POLAND SPRING 24 PK")).map(ReceiptReader.PackSize::unit).contains("pack");
        assertThat(ReceiptReader.packSize("2% MILK 1GAL")).map(ReceiptReader.PackSize::unit).contains("gal");
        assertThat(ReceiptReader.packSize("GREEK YOGURT 500G")).map(ReceiptReader.PackSize::unit).contains("g");
        // An O read as a nought.
        assertThat(ReceiptReader.packSize("KNGS BABY SPINACH 50Z")).contains(new ReceiptReader.PackSize(new BigDecimal("5"), "oz"));
        // A count beats a size: the price was for the 12 pack.
        assertThat(ReceiptReader.packSize("COLA 12PK 12OZ")).map(ReceiptReader.PackSize::unit).contains("pack");
        // Not sizes.
        assertThat(ReceiptReader.packSize("GROUND BEEF 85%")).isEmpty();
        assertThat(ReceiptReader.packSize("V8 SPLASH")).isEmpty();
        assertThat(ReceiptReader.packSize(null)).isEmpty();

        DraftLine sized = read("KNGS BABY SPINACH 5OZ 3.99 F").lines().get(0);
        assertThat(sized.quantity()).isEqualByComparingTo("5");
        assertThat(sized.unit()).isEqualTo("oz");
        assertThat(sized.unitPrice()).isNull();
        // Weighed or counted on the receipt: that is how much, not the name's size.
        DraftLine counted = read("YOGURT 5.3OZ", "2 @ 1.25 2.50").lines().get(0);
        assertThat(counted.quantity()).isEqualByComparingTo("2");
        assertThat(counted.unit()).isNull();
    }

    @Test
    void weightLinesInTheWaysTillsPrintThem() {
        for (String weight : List.of("1.32 lb @ 2.99 /lb 3.95", "1.32 LB @ $2.99/LB 3.95 F", "1.32 lbs @ 2.99/lb 3.95",
                "NET WT 1.32 lb @ 2.99/lb 3.95", "1.32 @ 2.99 3.95")) {
            DraftLine line = read("GROUND BEEF", weight).lines().get(0);
            assertThat(line.text()).as(weight).isEqualTo("GROUND BEEF");
            assertThat(line.quantity()).as(weight).isEqualByComparingTo("1.32");
            assertThat(line.unit()).as(weight).isEqualTo("lb");
            assertThat(line.unitPrice()).as(weight).isEqualByComparingTo("2.99");
            assertThat(line.price()).as(weight).isEqualByComparingTo("3.95");
        }
    }

    @Test
    void aWeightWithoutAPriceBelongsToTheItemItAddsUpTo() {
        ReceiptDraft draft = read("CHEESE 3.30", "BREAD 4.00", "0.75 lb @ 4.40/lb", "SUBTOTAL 7.30");
        // 0.75 × 4.40 is 3.30, but the weight is under the bread: it is not the bread's (4.00), so
        // it waits for an item below — and there is none, so it is unread rather than guessed.
        assertThat(draft.lines()).extracting(DraftLine::quantity).containsOnlyNulls();
        assertThat(draft.unreadLines()).containsExactly("0.75 lb @ 4.40/lb");

        ReceiptDraft after = read("CHEESE 3.30", "0.75 lb @ 4.40/lb", "BREAD 4.00");
        assertThat(after.lines().get(0).quantity()).isEqualByComparingTo("0.75");
        assertThat(after.lines().get(1).quantity()).isNull();
    }

    @Test
    void aWeightAboveAnItemIsThatItems() {
        DraftLine line = read("0.50 lb @ 9.98/lb", "SMOKED SALMON 4.99 F").lines().get(0);
        assertThat(line.text()).isEqualTo("SMOKED SALMON");
        assertThat(line.quantity()).isEqualByComparingTo("0.50");
        assertThat(line.unitPrice()).isEqualByComparingTo("9.98");
    }

    @Test
    void countLinesAndDeals() {
        DraftLine each = read("LIMES", "4 @ 0.50 2.00").lines().get(0);
        assertThat(each.quantity()).isEqualByComparingTo("4");
        assertThat(each.unit()).isNull();
        assertThat(each.unitPrice()).isEqualByComparingTo("0.50");
        assertThat(each.price()).isEqualByComparingTo("2.00");

        DraftLine deal = read("SPARKLING WATER", "2 @ 2/5.00 5.00 F").lines().get(0);
        assertThat(deal.quantity()).isEqualByComparingTo("2");
        assertThat(deal.unitPrice()).isEqualByComparingTo("2.50");

        DraftLine threeFor = read("AVOCADOS", "3 @ 3 FOR 4.00 4.00").lines().get(0);
        assertThat(threeFor.unitPrice()).isEqualByComparingTo("1.333");

        // The count after an item that already has its price, when it adds up to it.
        DraftLine under = read("YOGURT CUPS 3.98", "2 @ 1.99").lines().get(0);
        assertThat(under.quantity()).isEqualByComparingTo("2");
        assertThat(under.price()).isEqualByComparingTo("3.98");
    }

    @Test
    void aWeightLineWithAPriceAndNoNameAboveIsStillSomethingBought() {
        ReceiptDraft draft = read("1.32 lb @ 2.99 /lb 3.95", "SUBTOTAL 3.95");
        assertThat(draft.lines()).extracting(DraftLine::text, DraftLine::price)
                .containsExactly(tuple("1.32 lb @ 2.99 /lb 3.95", money("3.95")));
        assertThat(draft.lines().get(0).ingredientId()).isNull();
        assertThat(draft.sumMatches()).isTrue();
    }

    @Test
    void aWeightLineRepeatingThePriceAboveIsNotASecondItem() {
        ReceiptDraft draft = read("BANANAS 1.41", "2.04 lb @ 0.69 /lb 1.41");
        assertThat(draft.lines()).hasSize(1);
        assertThat(draft.lines().get(0).quantity()).isEqualByComparingTo("2.04");
    }

    // --- Discounts ---

    @Test
    void negativeAmountsComeOffTheItemAbove() {
        ReceiptDraft draft = read("COFFEE BEANS 12.99 F", "-2.00", "OLIVE OIL 9.49 F", "INSTANT SAVINGS 1.50-");
        assertThat(draft.lines()).extracting(DraftLine::text, DraftLine::price, DraftLine::onSale)
                .containsExactly(tuple("COFFEE BEANS", money("10.99"), true), tuple("OLIVE OIL", money("7.99"), true));
    }

    @Test
    void savingsWordsAreDiscountsEvenWithoutAMinus() {
        for (String saving : List.of("YOU SAVED 0.40", "CARD SAVINGS 0.40", "SALE 0.40", "BONUS BUY 0.40",
                "COUPON 0.40", "PRICE REDUCTION 0.40", "SC 0.40", "MFR CPN 0.40")) {
            DraftLine line = read("RASPBERRIES 4.99 F", saving).lines().get(0);
            assertThat(line.price()).as(saving).isEqualByComparingTo("4.59");
            assertThat(line.onSale()).as(saving).isTrue();
        }
    }

    @Test
    void aDiscountWithNothingAboveItIsUnread() {
        ReceiptDraft draft = read("STORE COUPON -1.00", "BUTTER 3.99");
        assertThat(draft.unreadLines()).containsExactly("STORE COUPON -1.00");
        assertThat(draft.lines()).extracting(DraftLine::price).containsExactly(money("3.99"));
    }

    @Test
    void aDiscountNeverTakesAnItemBelowNothing() {
        assertThat(read("GUM 1.00", "COUPON 2.00").lines().get(0).price()).isEqualByComparingTo("0.00");
    }

    @Test
    void savingsSummariesAreNotDiscounts() {
        ReceiptDraft draft = read("PEARS 3.00", "TOTAL SAVINGS 5.00", "SUBTOTAL 3.00", "TOTAL 3.00",
                "YOU SAVED 5.00", "SAVINGS THIS TRIP 5.00");
        assertThat(draft.lines()).extracting(DraftLine::price, DraftLine::onSale).containsExactly(tuple(money("3.00"), false));
        assertThat(draft.total()).isEqualByComparingTo("3.00");
        assertThat(draft.unreadLines()).isEmpty();
    }

    // --- Tax flags, totals and payment ---

    @Test
    void taxFlagsAfterThePriceAreNotPartOfIt() {
        for (String line : List.of("HUMMUS 3.49 F", "HUMMUS 3.49F", "HUMMUS 3.49 TF", "HUMMUS 3.49 T F", "HUMMUS 3.49 N",
                "HUMMUS 3.49 *", "HUMMUS $3.49 B", "HUMMUS 3.49")) {
            DraftLine read = read(line).lines().get(0);
            assertThat(read.text()).as(line).isEqualTo("HUMMUS");
            assertThat(read.price()).as(line).isEqualByComparingTo("3.49");
        }
    }

    @Test
    void subtotalTaxAndTotalAreReadAndAreNotThingsBought() {
        ReceiptDraft draft = read("BREAD 4.00", "SUB-TOTAL 4.00", "STATE TAX 0.20", "LOCAL TAX 0.06", "AMOUNT DUE 4.26");
        assertThat(draft.lines()).hasSize(1);
        assertThat(draft.subtotal()).isEqualByComparingTo("4.00");
        assertThat(draft.tax()).isEqualByComparingTo("0.26");
        assertThat(draft.total()).isEqualByComparingTo("4.26");

        assertThat(read("BREAD 4.00", "BALANCE DUE 4.00").total()).isEqualByComparingTo("4.00");
        assertThat(read("BREAD 4.00", "TOTAL $4.00").total()).isEqualByComparingTo("4.00");
    }

    @Test
    void paymentAndChangeLinesAreNotThingsBought() {
        ReceiptDraft draft = read("BREAD 4.00", "TOTAL 4.00", "VISA 4.00", "MASTERCARD 4.00", "MC 4.00", "AMEX 4.00",
                "DISCOVER 4.00", "DEBIT 4.00", "CREDIT 4.00", "EBT 4.00", "CASH 5.00", "CHANGE 1.00", "****1234 4.00",
                "AUTH CODE 123456 4.00", "APPROVED 4.00", "CARD # 4.00");
        assertThat(draft.lines()).hasSize(1);
        assertThat(draft.unreadLines()).isEmpty();
    }

    @Test
    void anAmountUnderTheTotalsThatIsNoneOfThemIsUnread() {
        ReceiptDraft draft = read("BREAD 4.00", "TOTAL 4.00", "VISA 4.00", "ROUND UP FOR CHARITY 0.50");
        assertThat(draft.unreadLines()).containsExactly("ROUND UP FOR CHARITY 0.50");
    }

    @Test
    void aYogurtCalledTotalIsAYogurt() {
        ReceiptDraft draft = read("FAGE TOTAL 0% YOGURT 5.99 F", "SUBTOTAL 5.99");
        assertThat(draft.lines()).extracting(DraftLine::text).containsExactly("FAGE TOTAL 0% YOGURT");
        assertThat(draft.total()).isNull();
        assertThat(draft.sumMatches()).isTrue();
    }

    @Test
    void mcCormickAboveTheTotalsIsSomethingBought() {
        ReceiptDraft draft = read("MC CORMICK PAPRIKA 4.29 F", "TOTAL 4.29", "MC 4.29");
        assertThat(draft.lines()).extracting(DraftLine::text).containsExactly("MC CORMICK PAPRIKA");
    }

    // --- Not food ---

    @Test
    void bagsDepositsAndGiftCardsAreNotFood() {
        ReceiptDraft draft = read("BAGS 0.20", "PAPER BAG 0.10", "BOTTLE DEPOSIT 0.30", "BTL DEP .05", "BTL DEPOSIT 0.05",
                "CRV 0.10", "GIFT CARD 25.00", "BAGELS 5.49", "BAGGED SALAD 3.99");
        assertThat(draft.lines()).extracting(DraftLine::text, DraftLine::kind).containsExactly(
                tuple("BAGS", "NOT_FOOD"), tuple("PAPER BAG", "NOT_FOOD"), tuple("BOTTLE DEPOSIT", "NOT_FOOD"),
                tuple("BTL DEP", "NOT_FOOD"), tuple("BTL DEPOSIT", "NOT_FOOD"), tuple("CRV", "NOT_FOOD"),
                tuple("GIFT CARD", "NOT_FOOD"), tuple("BAGELS", "ITEM"), tuple("BAGGED SALAD", "ITEM"));
    }

    @Test
    void notFoodCountsTowardsTheSubtotalButIsNeverAnIngredient() {
        ReceiptDraft draft = ReceiptReader.read(List.of("MILK BAG 0.10", "SUBTOTAL 0.10"), PANTRY, List.of());
        assertThat(draft.lines().get(0).kind()).isEqualTo("NOT_FOOD");
        assertThat(draft.lines().get(0).ingredientId()).isNull();
        assertThat(draft.sumMatches()).isTrue();
    }

    // --- Dates ---

    @Test
    void datesInTheWaysTillsPrintThem() {
        assertThat(ReceiptReader.dateIn("10/18/26 5:42 PM")).isEqualTo(LocalDate.of(2026, 10, 18));
        assertThat(ReceiptReader.dateIn("10/18/2026")).isEqualTo(LocalDate.of(2026, 10, 18));
        assertThat(ReceiptReader.dateIn("2026-10-18 17:42:09")).isEqualTo(LocalDate.of(2026, 10, 18));
        assertThat(ReceiptReader.dateIn("1/5/27 08:01")).isEqualTo(LocalDate.of(2027, 1, 5));
        assertThat(ReceiptReader.dateIn("10-18-2026 TRANS 1234")).isEqualTo(LocalDate.of(2026, 10, 18));
        assertThat(ReceiptReader.dateIn("13/45/26")).isNull();
        assertThat(ReceiptReader.dateIn("02/30/2026")).isNull();
        assertThat(ReceiptReader.dateIn("ST 0412 OP 23")).isNull();
        assertThat(ReceiptReader.dateIn("2 @ 2/5.00")).isNull();
    }

    @Test
    void theFirstPlausibleDateIsTheDay() {
        ReceiptDraft draft = read("REF 13/45/26", "BREAD 4.00", "TOTAL 4.00", "10/18/26 17:42", "RETURNS BY 11/17/26");
        assertThat(draft.purchasedOn()).isEqualTo(LocalDate.of(2026, 10, 18));
        assertThat(read("BREAD 4.00").purchasedOn()).isNull();
    }

    // --- The shop ---

    @Test
    void kingsAnywhereOnTheReceiptIsKings() {
        assertThat(read("WELCOME", "BREAD 4.00", "TOTAL 4.00", "THANK YOU FOR SHOPPING AT KINGS").storeName())
                .isEqualTo("Kings Food Markets");
    }

    @Test
    void theShopIsTheFirstNameLikeLineAtTheTop() {
        assertThat(read("Welcome to Trader Joe's", "BREAD 4.00").storeName()).isEqualTo("Trader Joe's");
        assertThat(read("CUSTOMER COPY", "#123", "SHOPRITE OF HOBOKEN", "900 Madison St", "BREAD 4.00").storeName())
                .isEqualTo("Shoprite Of Hoboken");
        assertThat(read("123 Main St", "201-555-0101", "BREAD 4.00").storeName()).isNull();
        // A name-like line under the first item is not the shop.
        assertThat(read("BREAD 4.00", "GREAT VALUE").storeName()).isNull();
    }

    @Test
    void anExistingStoreIsMatchedWhateverTheCase() {
        UUID kings = UUID.randomUUID();
        ReceiptDraft draft = ReceiptReader.read(List.of("KINGS FOOD MARKETS", "BREAD 4.00"), PANTRY,
                List.of(new KnownStore(kings, "kings food markets")));
        assertThat(draft.storeId()).isEqualTo(kings);
    }

    // --- Adding up ---

    @Test
    void sumMatchesWithinTwoCents() {
        assertThat(read("A THING 1.00", "ANOTHER 2.00", "SUBTOTAL 3.02").sumMatches()).isTrue();
        assertThat(read("A THING 1.00", "ANOTHER 2.00", "SUBTOTAL 3.03").sumMatches()).isFalse();
        assertThat(read("A THING 1.00", "ANOTHER 2.00", "TOTAL 3.00").sumMatches()).isNull();
    }

    // --- What nobody could read ---

    @Test
    void wordsBetweenTheItemsThatSayNothingAreUnread() {
        ReceiptDraft draft = read("STORE 22", "BREAD 4.00", "PRICE OVERRIDE", "MILK 3.00", "TOTAL 7.00", "STORE 22 REG 3");
        assertThat(draft.unreadLines()).containsExactly("PRICE OVERRIDE");
    }

    @Test
    void neverFailsOnNothing() {
        ReceiptDraft empty = ReceiptReader.read(List.of(), PANTRY, List.of());
        assertThat(empty.lines()).isEmpty();
        assertThat(empty.unreadLines()).isEmpty();
        assertThat(empty.storeName()).isNull();
        assertThat(empty.sumMatches()).isNull();

        ReceiptDraft blanks = ReceiptReader.read(Arrays.asList("", null, "   ", "\t"), PANTRY, List.of());
        assertThat(blanks.lines()).isEmpty();
        assertThat(ReceiptReader.read(null, PANTRY, List.of()).lines()).isEmpty();
    }

    // --- What a line counts as ---

    @Test
    void theGuessPrefersTheLongestMatchAmongTheHouseholdsOwn() {
        assertThat(guess("KNGS BABY SPINACH 5OZ")).isEqualTo("baby spinach");
        assertThat(guess("SPINACH 10OZ")).isEqualTo("spinach");
        assertThat(guess("KNGS PASTA SAUCE 24OZ")).isEqualTo("pasta sauce");
        assertThat(guess("DE CECCO PASTA 1LB")).isEqualTo("pasta");
    }

    @Test
    void theGuessIgnoresTheShopsBrandAndSizes() {
        assertThat(guess("KINGS ORGANIC BANANAS")).isEqualTo("bananas");
        assertThat(guess("KNGS WHOLE MILK 1/2 GAL")).isEqualTo("milk");
        assertThat(guess("EGGS LG 12 CT")).isEqualTo("large eggs");
        assertThat(guess("ROMA TOMATOES 2LB")).isEqualTo("tomatoes");
    }

    @Test
    void theGuessNeedsTheThingItselfNotJustAWordOfIt() {
        // "chicken thighs" shares CHICKEN, but broth is not thighs — and chicken broth is known.
        assertThat(guess("SWANSON CHICKEN BROTH 32OZ")).isEqualTo("chicken broth");
        assertThat(guess("CHICKEN NUGGETS")).isNull();
        // "whole wheat bread" shares WHOLE with whole milk, but milk is the thing.
        assertThat(guess("WHOLE MILK")).isEqualTo("milk");
        assertThat(guess("PARMIGIANO REGGIANO")).isNull();
        assertThat(guess("KNGS 16OZ")).isNull();
    }

    @Test
    void theGuessOnlyEverNamesTheHouseholdsOwn() {
        ReceiptDraft draft = ReceiptReader.read(List.of("BABY SPINACH 3.99"), List.of(), List.of());
        assertThat(draft.lines().get(0).ingredientId()).isNull();
        assertThat(draft.lines().get(0).ingredientName()).isNull();
    }

    @Test
    void singularsAndPluralsAreOneWord() {
        assertThat(ReceiptReader.singular("tomatoes")).isEqualTo("tomato");
        assertThat(ReceiptReader.singular("berries")).isEqualTo("berry");
        assertThat(ReceiptReader.singular("eggs")).isEqualTo("egg");
        assertThat(ReceiptReader.singular("peaches")).isEqualTo("peach");
        assertThat(ReceiptReader.singular("glass")).isEqualTo("glass");
        assertThat(guess("RASPBERRY JAM")).isNull();
        assertThat(ReceiptReader.guessIngredient("BLUEBERRY", List.of(known("blueberries"))))
                .map(KnownIngredient::name).contains("blueberries");
    }

    private static String guess(String text) {
        return ReceiptReader.guessIngredient(text, PANTRY).map(KnownIngredient::name).orElse(null);
    }
}
