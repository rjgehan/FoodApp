package com.gehan.mealplanner.receipts;

import com.gehan.mealplanner.receipts.ReceiptDtos.DraftLine;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptDraft;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Reads the text of a US supermarket till receipt into lines bought, the totals, the shop and
 * the day. Rules, not a model: the phone does the OCR on its own, sends the rows of text it saw,
 * and this works out what they mean — here, where it can be tested line by line on any machine,
 * and where a later on-phone tidy-up can sit in front of it without anything here changing.
 *
 * Written against Kings Food Markets' receipts, which come off an ordinary NCR/Toshiba-style
 * till, so most US supermarkets read the same way:
 *
 * <ul>
 *   <li>A line ending in an amount ("3.49", "$3.49", "-1.00", "1.00-"), maybe followed by tax
 *       flags ("F", "T", "TF", "*"), is something with a price; the words before it say what.</li>
 *   <li>A weight line — "1.32 lb @ 2.99 /lb" — or a count line — "2 @ 1.99", "2 @ 2/5.00" — says
 *       how much of the item next to it was bought. When it carries the price itself, the item's
 *       name is the line above it; when it does not, it belongs to the item it adds up to (the
 *       one above), or else the one below.</li>
 *   <li>A negative amount, or a line saying SAVINGS, SALE, COUPON and the like, comes off the
 *       item above and marks it on sale. A "you saved" summary under the totals is not a
 *       discount and is left alone.</li>
 *   <li>Subtotal, tax, total and the payment lines under them are not things bought. The first
 *       three are kept, to check the lines add up.</li>
 *   <li>Bags, bottle deposits and gift cards are paid for but are not food: NOT_FOOD, which the
 *       person can flip.</li>
 *   <li>Two prices on an item's line — Kings' "Price" and "You Pay" — are what it would have cost
 *       and what was paid: the second is the price, and the first only says it was on sale. A
 *       product code in front of the name ("2410044077 CHEEZ CRACKERS") is not part of it.</li>
 *   <li>A saving already in the price paid — Kings' "Member Savings -0.30" under 4.29 → 3.99, or
 *       ShopRite's "On Sale You Saved 1.80" — marks the item on sale and is not taken off again.</li>
 *   <li>Department headings (GROCERY, PRODUCE, DELI…) and rows of stars are skipped, and nothing
 *       under the total is unread news: it is the payment and the receipt's foot.</li>
 *   <li>A pack size in an item's name — "BABY SPINACH 5OZ", "TEA 20CT", "WATER 24PK" — is how
 *       much the price was for, when nothing was weighed or counted: 5 oz, 20 ct, 24 pack. An
 *       OCR'd "50Z" is 5 oz: the O read as a nought.</li>
 * </ul>
 *
 * Nothing is dropped quietly. A line between the first thing bought and the total that none of
 * the rules explain, or any line with an amount that is not explained, goes in `unreadLines` for
 * the phone to show folded away. Words above the first item (the shop's address, a welcome) and
 * below the total (a store number, thank you) are a receipt's head and foot, and are not news.
 *
 * Each item is also matched against the household's own ingredients — what is on its list and in
 * its recipes — for a first guess at what it counts as. The guess only ever names one of those:
 * reading a receipt never makes an ingredient.
 */
public final class ReceiptReader {

    /** One of the household's own ingredients, for guessing what a line counts as. */
    public record KnownIngredient(UUID id, String name) {
    }

    /** One of the household's shops, so a receipt from one it knows says which. */
    public record KnownStore(UUID id, String name) {
    }

    /** What Kings' receipts say at the top, whatever else they say. */
    static final String KINGS = "Kings Food Markets";

    /** Within two cents counts as adding up: rounding on a weighed price is often a cent out. */
    private static final BigDecimal NEAR_ENOUGH = new BigDecimal("0.02");

    // An amount at the end of a line: -3.49, $3.49, 3.49-, .05, then up to two tax flags (F, T, TF, *).
    private static final Pattern MONEY = Pattern.compile(
            "^(?<text>.*?)(?:^|\\s+|(?<=[$-]))(?<neg>-)?\\s?\\$?\\s?(?<amount>\\d{0,4}\\.\\d{2})(?<trail>-)?"
                    + "(?<flags>(?:\\s*[A-Z*]{1,2}){0,2})$");

    // "1.32 lb @ 2.99 /lb", "1.32 LB @ $2.99/LB", "1.32 @ 2.99", "2 @ 1.99", "2 @ 2/5.00", then maybe the price.
    private static final Pattern MEASURE = Pattern.compile(
            "^(?:NET\\s+)?(?:WT\\.?\\s*)?(?<qty>\\d{1,4}(?:\\.\\d{1,3})?)\\s*(?<unit>LBS?|KG|OZ)?\\.?\\s*@\\s*"
                    + "(?:(?<deal>\\d{1,2})\\s*(?:/|FOR)\\s*)?\\$?\\s?(?<each>\\d{1,4}(?:\\.\\d{1,3})?)"
                    + "\\s*(?:/\\s*(?<per>LBS?|KG|OZ|EA))?(?<rest>\\s.*)?$",
            Pattern.CASE_INSENSITIVE);

    // A pack size in a name, the last one in it: "5OZ", "5 OZ", "16.9 FL OZ", "20CT", "24 PK", "1GAL", "500G".
    // "0Z" is an O read as a nought, so "50Z" is 5 OZ.
    private static final Pattern PACK_SIZE = Pattern.compile(
            "(?<![\\w.])(?<qty>\\d{1,4}(?:\\.\\d{1,3})?)\\s?"
                    + "(?<unit>FL\\.?\\s?OZ|OZ|0Z|LBS?|CT|PK|PACK|GAL|QT|PT|ML|LTR|L|KG|GR|G)\\b",
            Pattern.CASE_INSENSITIVE);

    /** An amount at the end of an item's words, before the price paid: the "Price" column. */
    private static final Pattern LISTED = Pattern.compile("\\s\\$?(\\d{1,4}\\.\\d{2})$");

    private static final Pattern SUBTOTAL = Pattern.compile("\\bSUB[\\s-]?TOTAL\\b");
    private static final Pattern TAX = Pattern.compile("\\bTAX(?:\\b|\\d)");
    // The total says so first or last ("TOTAL", "**** BALANCE", "ORDER TOTAL"), never in the
    // middle: FAGE TOTAL 0% is yogurt.
    private static final Pattern TOTAL = Pattern.compile(
            "^(?:TOTAL|BALANCE|AMOUNT DUE|AMT DUE|BAL DUE)\\b|\\b(?:TOTAL|BALANCE|DUE)$");
    private static final Pattern DISCOUNT = Pattern.compile(
            "\\b(?:SAVINGS|YOU SAVED|SALE|BONUS|COUPON|CARD SAVINGS|PRICE REDUCTION|SC|MFR|DISCOUNT|PROMO)\\b"
                    + "|\\bMEMBER\\s+SAV\\w*|\\bSAVIN\\w*");
    /** A saving said, not taken: "On Sale You Saved 1.80" next to a price already reduced. */
    // ShopRite's "On Sale You Saved", as faded print reads it: "Jn Sale You Savec", "You Syvec".
    private static final Pattern SAVED = Pattern.compile("\\bYOU\\s+S[A-Z]{2,5}\\b|\\bSAVE[DOC]\\b|\\b[OIJ0]N\\s+SALE\\b");
    /** A department heading between the items, maybe with the column titles after it. */
    private static final Pattern HEADING = Pattern.compile(
            "^(?:\\W*)(?:GROCERY|PRODUCE|DAIRY|FROZEN|REFRIG(?:ERATED)?(?:\\s*/\\s*FROZEN)?|MEAT|MEATS|SEAFOOD|DELI|BAKERY"
                    + "|BAKED GOODS|GEN(?:ERAL)? MERCH\\w*|HBC|HEALTH (?:&|AND) BEAUTY|BEER (?:&|AND) WINE|FLORAL|BULK"
                    + "|PREPARED FOODS?|NATURAL(?: FOODS)?|ORGANIC|CHEESE|PHARMACY|HOUSEHOLD|PET|BABY|SNACKS|BEVERAGES?"
                    + "|REGULAR ITEMS|WEIGHED ITEMS|PRICE|YOU PAY)(?:\\W+(?:PRICE|YOU PAY|ITEMS))*\\W*$");
    /** Words in the items' midst that are about the shopper, not the shopping. */
    private static final Pattern SHOPPER = Pattern.compile(
            "\\b(?:VALUED\\s+CUST\\w*|CUSTOMER|REWARDS?|CLUB CARD|PRICE ?PLUS|LOYALTY|MEMBER #|ACCOUNT)\\b");
    private static final Pattern SAVINGS_SUMMARY = Pattern.compile(
            "\\b(?:TOTAL|YOUR|TODAY'?S?)\\b.*\\bSAV|\\bSAV\\w*\\b.*\\b(?:TODAY|TOTAL|THIS (?:TRIP|VISIT))\\b");
    /** Payment words that are never part of an item's name. */
    private static final Pattern PAYMENT = Pattern.compile(
            "\\b(?:VISA|MASTERCARD|AMEX|AMERICAN EXPRESS|DEBIT|CREDIT|EBT|APPROVED|AUTH(?:ORIZATION)?|TEND(?:ER)?)\\b"
                    + "|\\bCARD\\s*#|[*X]{4,}\\s*\\d{4}");
    /** Payment words an item could be called too ("MC" for McCormick), so only under the totals. */
    private static final Pattern PAYMENT_UNDER_TOTALS = Pattern.compile(
            "\\b(?:CASH|CHANGE|MC|DISCOVER|PAYMENT|PAID)\\b");
    private static final Pattern NOT_FOOD = Pattern.compile(
            "\\b(?:BAGS?|BAG FEE|BOTTLE DEPOSIT|BTL DEP\\w*|CRV|GIFT CARD)\\b");

    private static final Pattern SLASH_DATE = Pattern.compile("\\b(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4}|\\d{2})\\b");
    private static final Pattern ISO_DATE = Pattern.compile("\\b(\\d{4})-(\\d{1,2})-(\\d{1,2})\\b");

    /** Looks like a shop's name: letters and the odd &, apostrophe or dash — no digits, no commas. */
    private static final Pattern NAME_LIKE = Pattern.compile("^[A-Za-z][A-Za-z&'.\\- ]{2,79}$");
    private static final Pattern HEADER_NOISE = Pattern.compile(
            "\\b(?:WELCOME|RECEIPT|CASHIER|STORE|MANAGER|THANK|CUSTOMER|COPY|SALE|REGISTER)\\b");

    /**
     * What a till's abbreviations mean, for guessing what a line is: "BNLS SKNLS CHKN BRST" is
     * boneless skinless chicken breast. Only for the guess — the line keeps its words as printed.
     */
    private static final Map<String, String> ABBREVIATIONS = Map.ofEntries(
            Map.entry("chkn", "chicken"), Map.entry("chk", "chicken"), Map.entry("ckn", "chicken"),
            Map.entry("chix", "chicken"), Map.entry("brst", "breast"), Map.entry("bst", "breast"),
            Map.entry("thgh", "thigh"), Map.entry("thghs", "thighs"), Map.entry("bnls", "boneless"),
            Map.entry("sknls", "skinless"), Map.entry("grnd", "ground"), Map.entry("grd", "ground"),
            Map.entry("bf", "beef"), Map.entry("trky", "turkey"), Map.entry("tky", "turkey"),
            Map.entry("bcn", "bacon"), Map.entry("saus", "sausage"), Map.entry("ssg", "sausage"),
            Map.entry("slmn", "salmon"), Map.entry("shrmp", "shrimp"), Map.entry("tna", "tuna"),
            Map.entry("spnch", "spinach"), Map.entry("bby", "baby"), Map.entry("lttc", "lettuce"),
            Map.entry("lett", "lettuce"), Map.entry("rom", "romaine"), Map.entry("tom", "tomato"),
            Map.entry("toms", "tomatoes"), Map.entry("tmto", "tomato"), Map.entry("pot", "potato"),
            Map.entry("pots", "potatoes"), Map.entry("onn", "onion"), Map.entry("onns", "onions"),
            Map.entry("ylw", "yellow"), Map.entry("yel", "yellow"), Map.entry("grn", "green"),
            Map.entry("pepr", "pepper"), Map.entry("ppr", "pepper"), Map.entry("cuke", "cucumber"),
            Map.entry("cuc", "cucumber"), Map.entry("crt", "carrot"), Map.entry("crts", "carrots"),
            Map.entry("broc", "broccoli"), Map.entry("caul", "cauliflower"), Map.entry("mush", "mushroom"),
            Map.entry("mshrm", "mushroom"), Map.entry("mshrms", "mushrooms"), Map.entry("grlc", "garlic"),
            Map.entry("apl", "apple"), Map.entry("apls", "apples"), Map.entry("bnna", "banana"),
            Map.entry("bnns", "bananas"), Map.entry("strwb", "strawberry"), Map.entry("strawb", "strawberry"),
            Map.entry("blbry", "blueberry"), Map.entry("blueb", "blueberry"), Map.entry("avo", "avocado"),
            Map.entry("avoc", "avocado"), Map.entry("lmn", "lemon"), Map.entry("lmns", "lemons"),
            Map.entry("whl", "whole"), Map.entry("mlk", "milk"), Map.entry("ygrt", "yogurt"),
            Map.entry("yog", "yogurt"), Map.entry("yogt", "yogurt"), Map.entry("grk", "greek"),
            Map.entry("chs", "cheese"), Map.entry("chse", "cheese"), Map.entry("chdr", "cheddar"),
            Map.entry("shrp", "sharp"), Map.entry("mozz", "mozzarella"), Map.entry("parm", "parmesan"),
            Map.entry("btr", "butter"), Map.entry("crm", "cream"), Map.entry("hvy", "heavy"),
            Map.entry("brd", "bread"), Map.entry("sdough", "sourdough"), Map.entry("flr", "flour"),
            Map.entry("sgr", "sugar"), Map.entry("rce", "rice"), Map.entry("psta", "pasta"),
            Map.entry("spgh", "spaghetti"), Map.entry("spag", "spaghetti"), Map.entry("sce", "sauce"),
            Map.entry("sauc", "sauce"), Map.entry("olv", "olive"), Map.entry("evoo", "olive oil"),
            Map.entry("vngr", "vinegar"), Map.entry("crl", "cereal"), Map.entry("choc", "chocolate"),
            Map.entry("cof", "coffee"), Map.entry("cfe", "coffee"), Map.entry("cffe", "coffee"),
            Map.entry("wtr", "water"), Map.entry("sprk", "sparkling"), Map.entry("oj", "orange juice"),
            Map.entry("jce", "juice"), Map.entry("bns", "beans"), Map.entry("blk", "black"),
            Map.entry("chkpea", "chickpea"), Map.entry("chkpeas", "chickpeas"), Map.entry("hmms", "hummus"),
            Map.entry("tort", "tortilla"), Map.entry("trtla", "tortilla"), Map.entry("eng", "english"),
            Map.entry("brkfst", "breakfast"), Map.entry("bkfst", "breakfast"), Map.entry("pln", "plain"),
            Map.entry("van", "vanilla"), Map.entry("strw", "strawberry"), Map.entry("pb", "peanut butter"),
            Map.entry("pnut", "peanut"));

    /** The shop's own brand and the words a till abbreviates to, none of which say what a thing is. */
    private static final Set<String> NOT_WHAT_IT_IS = Set.of(
            "kngs", "kings", "kng", "kf", "kfm",
            "oz", "fl", "floz", "lb", "lbs", "ct", "gal", "qt", "pt", "ml", "ltr", "l", "g", "kg",
            "pk", "pack", "ea", "each", "pc", "pcs", "sz", "size", "lg", "sm", "md", "xl",
            "org", "organic", "fresh", "the", "and", "of", "with", "a");

    private ReceiptReader() {
    }

    /**
     * Reads one receipt. `lines` are the rows the phone saw, top to bottom; blank ones are fine.
     * Never fails: a receipt it cannot make head or tail of comes back with everything unread.
     */
    public static ReceiptDraft read(List<String> lines, Collection<KnownIngredient> ingredients,
                                    Collection<KnownStore> stores) {
        Reading reading = new Reading(tidy(lines));
        reading.run();
        reading.settle();

        String storeName = reading.storeName();
        UUID storeId = storeName == null ? null : stores.stream()
                .filter(s -> s.name().trim().equalsIgnoreCase(storeName))
                .map(KnownStore::id)
                .findFirst().orElse(null);

        List<DraftLine> drafted = reading.items.stream()
                .map(item -> {
                    Optional<KnownIngredient> guess = ReceiptLine.ITEM.equals(item.kind)
                            ? guessIngredient(item.text, ingredients) : Optional.empty();
                    // Nothing weighed or counted: a size in the name is what the price was for.
                    if (ReceiptLine.ITEM.equals(item.kind) && item.quantity == null && item.unitPrice == null) {
                        packSize(item.text).ifPresent(size -> {
                            item.quantity = size.quantity();
                            item.unit = size.unit();
                        });
                    }
                    return new DraftLine(item.text, item.kind, item.quantity, item.unit, item.unitPrice,
                            item.price.setScale(2, RoundingMode.HALF_UP), item.onSale,
                            guess.map(KnownIngredient::id).orElse(null),
                            guess.map(KnownIngredient::name).orElse(null), null);
                })
                .toList();

        // What the lines should add up to: the subtotal, or — on a receipt that prints none, as
        // Kings' does — the total less the tax.
        BigDecimal expected = reading.subtotal != null ? reading.subtotal
                : reading.total != null ? reading.total.subtract(reading.tax != null ? reading.tax : BigDecimal.ZERO) : null;
        Boolean sumMatches = null;
        if (expected != null && !drafted.isEmpty()) {
            BigDecimal sum = drafted.stream().map(DraftLine::price).reduce(BigDecimal.ZERO, BigDecimal::add);
            sumMatches = sum.subtract(expected).abs().compareTo(NEAR_ENOUGH) <= 0;
        }
        // The day said most; between days said as often, the latest that is not still to come — a
        // receipt is scanned soon after the shop, and a misread year is usually an older one.
        LocalDate today = LocalDate.now();
        LocalDate day = reading.dates.entrySet().stream()
                .max(Comparator.<Map.Entry<LocalDate, Integer>>comparingInt(Map.Entry::getValue)
                        .thenComparing(e -> !e.getKey().isAfter(today.plusDays(1)))
                        .thenComparing(Map.Entry::getKey))
                .map(Map.Entry::getKey).orElse(reading.date);
        return new ReceiptDraft(storeName, storeId, day, reading.subtotal, reading.tax, reading.total,
                sumMatches, null, drafted, List.copyOf(reading.unread));
    }

    /** How much one of something is, by the size printed in its name. */
    record PackSize(BigDecimal quantity, String unit) {
    }

    /**
     * The pack size in a line's name, its unit as the app writes units: "5OZ" is 5 oz. A count
     * beats a size ("COLA 12PK 12OZ" is a 12 pack, which is what the price was for); otherwise the
     * last size in the name.
     */
    static Optional<PackSize> packSize(String text) {
        if (text == null) {
            return Optional.empty();
        }
        Matcher m = PACK_SIZE.matcher(text);
        PackSize last = null;
        PackSize count = null;
        while (m.find()) {
            BigDecimal quantity = new BigDecimal(m.group("qty"));
            if (quantity.signum() <= 0) {
                continue;
            }
            String unit = m.group("unit").toUpperCase(Locale.ROOT).replaceAll("[\\s.]", "");
            // 20, not 2E+1: stripping a whole number's zeros leaves it in powers of ten.
            BigDecimal plain = quantity.stripTrailingZeros();
            last = new PackSize(plain.scale() < 0 ? plain.setScale(0) : plain, switch (unit) {
                case "FLOZ" -> "fl oz";
                case "OZ", "0Z" -> "oz";
                case "LB", "LBS" -> "lb";
                case "CT" -> "ct";
                case "PK", "PACK" -> "pack";
                case "LTR", "L" -> "l";
                case "GR", "G" -> "g";
                default -> unit.toLowerCase(Locale.ROOT);
            });
            if (count == null && ("ct".equals(last.unit()) || "pack".equals(last.unit()))) {
                count = last;
            }
        }
        return Optional.ofNullable(count != null ? count : last);
    }

    /**
     * Tabs and runs of spaces are one space; nothing is null; and the slips the phone's text
     * reading makes on a till's print are put right before anything reads the line — see
     * {@link #repair}.
     */
    private static List<String> tidy(List<String> lines) {
        if (lines == null) {
            return List.of();
        }
        return lines.stream()
                .map(line -> line == null ? "" : repair(line.replace('\t', ' ').replaceAll("\\s+", " ").trim()))
                .toList();
    }

    /** Cyrillic and Greek capitals that look like Latin ones, as the text reading sometimes returns them. */
    private static final String LOOKALIKES = "АВЕКМНОРСТХаеорсхуΑΒΕΗΙΚΜΝΟΡΤΧΥ";
    private static final String LATIN = "ABEKMHOPCTXaeopcxyABEHIKMNOPTXY";

    // An amount at the very end, as the text reading spoils it: "1,98", "3. 49", "l.99", "4.O9".
    private static final Pattern SPOILT_AMOUNT = Pattern.compile(
            "(?<lead>^|\\s|\\$)(?<amount>[\\dOoIl]{0,4}\\s?[.,]\\s?[\\dOoIl]{2})(?<tail>-?(?:\\s+[A-Z*]{1,2}){0,2})$");
    // A date run into its time: "10/18/265:42 PM".
    private static final Pattern DATE_INTO_TIME = Pattern.compile("(\\b\\d{1,2}/\\d{1,2}/\\d{2})(\\d{1,2}:\\d{2})");
    // A count or weight line whose @ was not read: "2 0.99 1.98", "1.32 lb 0.69 /lb 0.91".
    // A tax flag read as something else after an amount: S as $, 5, 8 or §.
    private static final Pattern MISREAD_FLAG = Pattern.compile("(\\d[.,]\\d{2}-?)\\s+[$58§|!l]$");
    // ...or glued on: "5.795" is 5.79 S, but only where an amount stands before it ("5.79 5.795").
    private static final Pattern GLUED_FLAG = Pattern.compile("(\\d\\.\\d{2}\\s+\\d{1,4}\\.\\d{2})[$58§]$");
    private static final Pattern COUNT_WITHOUT_AT = Pattern.compile(
            "^(?<qty>\\d{1,4}(?:\\.\\d{1,3})?)(?<unit>\\s?(?:LBS?|KG|OZ)\\.?)?\\s+\\$?(?<each>\\d{1,4}\\.\\d{2,3})"
                    + "(?<per>\\s*/\\s*(?:LBS?|KG|OZ|EA))?\\s+(?<amount>\\d{1,4}\\.\\d{2})(?<flags>(?:\\s*[A-Z*]{1,2}){0,2})$",
            Pattern.CASE_INSENSITIVE);

    /**
     * What the phone's text reading gets wrong on a till's print, put right: lookalike letters
     * from other alphabets, an amount at the end with a comma, a space, or an O or an l for a
     * digit in it, a date run into its time, and a count or weight line whose @ was lost — only
     * when the amount it ends with is that many at that price, so a line that merely has three
     * numbers in it is left alone.
     */
    static String repair(String line) {
        StringBuilder plain = new StringBuilder(line.length());
        for (char ch : line.toCharArray()) {
            int at = LOOKALIKES.indexOf(ch);
            plain.append(at >= 0 ? LATIN.charAt(at) : ch);
        }
        String fixed = DATE_INTO_TIME.matcher(plain.toString()).replaceAll("$1 $2");
        fixed = MISREAD_FLAG.matcher(fixed).replaceAll("$1 S");
        fixed = GLUED_FLAG.matcher(fixed).replaceAll("$1 S");
        // "/1b" is /lb, "0.89 1b" is 0.89 lb, "lb@" is lb @, and "Z.25" in a weight is 2.25.
        fixed = fixed.replaceAll("/\\s?[1I][bD]\\b", "/lb")
                .replaceAll("(\\d)\\s?(?:1b|Ib)\\b", "$1 lb")
                .replaceAll("(?i)\\b(lbs?|kg|oz)@", "$1 @")
                .replaceAll("(?<=^|\\s)Z(?=\\.\\d{2})", "2");

        Matcher spoilt = SPOILT_AMOUNT.matcher(fixed);
        if (spoilt.find() && spoilt.group("amount").chars().anyMatch(Character::isDigit)) {
            String amount = spoilt.group("amount").replace(" ", "").replace(',', '.')
                    .replace('O', '0').replace('o', '0').replace('I', '1').replace('l', '1');
            fixed = fixed.substring(0, spoilt.start("amount")) + amount + spoilt.group("tail");
        }

        Matcher count = COUNT_WITHOUT_AT.matcher(fixed);
        if (count.matches()) {
            BigDecimal quantity = new BigDecimal(count.group("qty"));
            BigDecimal each = new BigDecimal(count.group("each"));
            BigDecimal amount = new BigDecimal(count.group("amount"));
            BigDecimal expected = quantity.multiply(each).setScale(2, RoundingMode.HALF_UP);
            if (quantity.signum() > 0 && expected.subtract(amount).abs().compareTo(NEAR_ENOUGH) <= 0) {
                fixed = count.group("qty") + (count.group("unit") != null ? count.group("unit") : "") + " @ "
                        + count.group("each") + (count.group("per") != null ? count.group("per") : "") + " "
                        + count.group("amount") + count.group("flags");
            }
        }
        return fixed;
    }

    // --- Reading the lines ---

    /** One thing bought, as it is worked out. */
    private static final class Item {
        String text;
        String kind = ReceiptLine.ITEM;
        BigDecimal quantity;
        String unit;
        BigDecimal unitPrice;
        BigDecimal price;
        boolean onSale;
        /** The "Price" column, when the line had one before the price paid. */
        BigDecimal listed;

        Item(String text, BigDecimal price) {
            // A product code in front is the till's, not the name: "2410044077 CHEEZ CRACKERS".
            text = text.replaceFirst("^\\d{4,14}\\s+(?=\\S*[A-Za-z])", "");
            this.text = text.length() > 200 ? text.substring(0, 200) : text;
            this.price = price;
            if (NOT_FOOD.matcher(text.toUpperCase(Locale.ROOT)).find()) {
                kind = ReceiptLine.NOT_FOOD;
            }
        }

        /** The "Price" column, then the "You Pay" one: the second is what was paid. */
        void takeListedPrice() {
            Matcher listedPrice = LISTED.matcher(text);
            if (listedPrice.find() && hasLetters(text.substring(0, listedPrice.start()))) {
                listed = new BigDecimal(listedPrice.group(1));
                text = text.substring(0, listedPrice.start()).trim();
                onSale = listed.compareTo(price) > 0;
            }
        }

        void measure(Measure m) {
            quantity = m.quantity;
            unit = m.unit;
            unitPrice = m.unitPrice;
        }
    }

    /** A saving read one way (`taken` or not) that the receipt's total may turn round. */
    private record Maybe(Item item, BigDecimal amount, boolean taken) {
    }

    /** An amount at the end of a line and the words before it. */
    private record Money(String text, BigDecimal amount, boolean negative) {
    }

    /** How much of something: a weight with its price per lb, or a count with its price each. */
    private record Measure(BigDecimal quantity, String unit, BigDecimal unitPrice, BigDecimal amount) {

        /** Whether it accounts for this price, give or take the rounding. */
        boolean fits(BigDecimal price) {
            BigDecimal expected = quantity.multiply(unitPrice).setScale(2, RoundingMode.HALF_UP);
            return expected.subtract(price).abs().compareTo(NEAR_ENOUGH) <= 0;
        }
    }

    private static final class Reading {
        final List<String> lines;
        final List<Item> items = new ArrayList<>();
        final List<String> unread = new ArrayList<>();
        final List<String> header = new ArrayList<>();
        boolean kings;
        LocalDate date;
        /** Every day the receipt says, and how often: a misread one is outvoted. */
        final Map<LocalDate, Integer> dates = new java.util.LinkedHashMap<>();
        BigDecimal subtotal;
        BigDecimal tax;
        BigDecimal total;
        /** A subtotal, tax or total has been read: the things bought are over. */
        boolean inTotals;
        /** The total itself has been read: everything after is payment and the receipt's foot. */
        boolean pastTotal;
        /** Savings read one way that the total may say were the other: taken, or only said. */
        final List<Maybe> maybe = new ArrayList<>();
        /** A weight or count line waiting for the item below it, with its line as printed. */
        Measure waiting;
        String waitingLine;

        Reading(List<String> lines) {
            this.lines = lines;
        }

        void run() {
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                if (line.isEmpty()) {
                    continue;
                }
                String upper = line.toUpperCase(Locale.ROOT);
                if (upper.contains("KINGS")) {
                    kings = true;
                }
                i = readLine(i, line, upper);
            }
            if (waiting != null) {
                unread.add(waitingLine);
            }
        }

        /**
         * The savings that could be read either way, turned round where that makes the lines add
         * up to what the receipt says and the way they were read does not: the fewest turned that
         * do it. A receipt with no subtotal or total to go by is left as read.
         */
        void settle() {
            BigDecimal expected = subtotal != null ? subtotal
                    : total != null ? total.subtract(tax != null ? tax : BigDecimal.ZERO) : null;
            if (expected == null || maybe.isEmpty() || maybe.size() > 12) {
                return;
            }
            BigDecimal sum = items.stream().map(item -> item.price).reduce(BigDecimal.ZERO, BigDecimal::add);
            if (sum.subtract(expected).abs().compareTo(NEAR_ENOUGH) <= 0) {
                return;
            }
            int best = -1;
            for (int mask = 1; mask < (1 << maybe.size()); mask++) {
                BigDecimal turned = sum;
                for (int k = 0; k < maybe.size(); k++) {
                    if ((mask & (1 << k)) != 0) {
                        Maybe m = maybe.get(k);
                        turned = m.taken() ? turned.add(m.amount()) : turned.subtract(m.amount());
                    }
                }
                if (turned.subtract(expected).abs().compareTo(NEAR_ENOUGH) <= 0
                        && (best < 0 || Integer.bitCount(mask) < Integer.bitCount(best))) {
                    best = mask;
                }
            }
            if (best < 0) {
                return;
            }
            for (int k = 0; k < maybe.size(); k++) {
                if ((best & (1 << k)) != 0) {
                    Maybe m = maybe.get(k);
                    m.item().price = m.taken() ? m.item().price.add(m.amount())
                            : m.item().price.subtract(m.amount()).max(BigDecimal.ZERO);
                }
            }
        }

        /** Reads the line at i, and says which line it got to: further on when it took the next one too. */
        private int readLine(int i, String line, String upper) {
            Money money = money(line);
            Measure measure = measure(line);

            if (money == null && measure == null) {
                LocalDate seen = dateIn(line);
                if (seen != null) {
                    if (date == null) {
                        date = seen;
                    }
                    dates.merge(seen, 1, Integer::sum);
                    return i;
                }
            }

            if (measure != null && !inTotals) {
                readMeasure(line, measure);
                return i;
            }

            if (money == null) {
                return readWords(i, line);
            }
            readMoney(line, upper, money);
            return i;
        }

        /** A line of words with no price on it. */
        private int readWords(int i, String line) {
            String upper = line.toUpperCase(Locale.ROOT);
            // A total's word whose amount the reading put on another row ("TAX" … "0.00"): no news.
            if (!items.isEmpty() && (SUBTOTAL.matcher(upper).find() || TAX.matcher(upper).find()
                    || TOTAL.matcher(label(line)).find()) && upper.replaceAll("[^A-Z]", "").length() <= 12) {
                inTotals = true;
                return i;
            }
            if (!items.isEmpty() && !inTotals && (HEADING.matcher(upper).matches() || SHOPPER.matcher(upper).find()
                    || decoration(line))) {
                return i;
            }
            int next = nextLine(i);
            if (!inTotals && next >= 0 && hasLetters(line)) {
                // A name whose price, or weight and price, is on the row below.
                String below = lines.get(next);
                Measure measure = measure(below);
                if (measure != null && measure.amount() != null) {
                    Item item = new Item(line, measure.amount());
                    item.measure(measure);
                    add(item);
                    return next;
                }
                Money money = money(below);
                if (money != null && money.text().isEmpty() && !money.negative() && measure == null) {
                    add(new Item(line, money.amount()));
                    return next;
                }
            }
            if (items.isEmpty() && !inTotals) {
                header.add(line);
            } else if (!pastTotal) {
                unread.add(line);
            }
            return i;
        }

        private void readMeasure(String line, Measure measure) {
            Item last = items.isEmpty() ? null : items.get(items.size() - 1);
            if (measure.amount() != null) {
                // The price is on the weight line, and the name was not on the row above it (that
                // is read with the name). Either the item above printed the same price, or the
                // name is missing and the weight line is all there is to go on.
                if (last != null && last.quantity == null && last.price.compareTo(measure.amount()) == 0) {
                    last.measure(measure);
                } else {
                    Item item = new Item(line, measure.amount());
                    item.measure(measure);
                    add(item);
                }
                return;
            }
            if (last != null && last.quantity == null && measure.fits(last.price)) {
                last.measure(measure);
            } else {
                if (waiting != null) {
                    unread.add(waitingLine);
                }
                waiting = measure;
                waitingLine = line;
            }
        }

        private void readMoney(String line, String upper, Money money) {
            if (SAVINGS_SUMMARY.matcher(upper).find()
                    || (inTotals && DISCOUNT.matcher(upper).find() && !NOT_FOOD.matcher(upper).find())) {
                return;
            }
            if (SUBTOTAL.matcher(upper).find()) {
                if (subtotal == null) {
                    subtotal = money.amount();
                }
                inTotals = true;
                return;
            }
            if (TAX.matcher(upper).find() && !pastTotal) {
                tax = tax == null ? money.amount() : tax.add(money.amount());
                inTotals = true;
                return;
            }
            if (TOTAL.matcher(label(money.text())).find()) {
                if (total == null) {
                    total = money.amount();
                }
                inTotals = true;
                pastTotal = true;
                return;
            }
            if (PAYMENT.matcher(upper).find() || (inTotals && PAYMENT_UNDER_TOTALS.matcher(upper).find())) {
                return;
            }
            if (inTotals) {
                // An amount between the subtotal and the total that is not one of them could be
                // anything, so say so; under the total it is the payment and the receipt's foot.
                if (!pastTotal) {
                    unread.add(line);
                }
                return;
            }
            if (SHOPPER.matcher(upper).find() && !DISCOUNT.matcher(upper).find()) {
                return;
            }
            if (money.negative() || DISCOUNT.matcher(upper).find()) {
                Item last = items.isEmpty() ? null : items.get(items.size() - 1);
                if (last == null) {
                    unread.add(line);
                    return;
                }
                // The weight a coupon was worked out on ("1.45 lb @ 1.50 /lb" over 2.18 off) is the coupon's.
                if (waiting != null && waiting.fits(money.amount())) {
                    waiting = null;
                    waitingLine = null;
                }
                last.onSale = true;
                /*
                 Some savings lines say what was saved on a price already reduced, and some take it
                 off; the words alone do not always tell. These are read the likelier way here, and
                 the receipt's total settles it at the end (`settle`).
                 - ShopRite's "On Sale You Saved 1.80" under a sale price: said, not taken.
                 - Kings' 4.29 → 3.99, then "Member Savings -0.30": already in the price paid.
                 - A bare "You Saved 0.40": taken.
                */
                boolean onSaleNote = !money.negative() && SAVED.matcher(upper).find()
                        && upper.matches(".*\\b[OIJ0]N\\s+SALE\\b.*");
                boolean included = last.listed != null
                        && last.listed.subtract(last.price).subtract(money.amount()).abs().compareTo(NEAR_ENOUGH) <= 0;
                boolean saidOnly = !money.negative() && SAVED.matcher(upper).find();
                if (onSaleNote || included) {
                    maybe.add(new Maybe(last, money.amount(), false));
                    return;
                }
                if (saidOnly) {
                    maybe.add(new Maybe(last, money.amount(), true));
                }
                last.price = last.price.subtract(money.amount()).max(BigDecimal.ZERO);
                return;
            }
            if (money.text().isEmpty() || !hasLetters(money.text())) {
                unread.add(line);
                return;
            }
            Item item = new Item(money.text(), money.amount());
            item.takeListedPrice();
            if (waiting != null) {
                item.measure(waiting);
                waiting = null;
                waitingLine = null;
            }
            add(item);
        }

        private void add(Item item) {
            items.add(item);
        }

        private int nextLine(int i) {
            for (int j = i + 1; j < lines.size(); j++) {
                if (!lines.get(j).isEmpty()) {
                    return j;
                }
            }
            return -1;
        }

        /**
         * Kings, if the receipt says so anywhere; otherwise the first line of its head that reads
         * like a name, in title case if the till shouted it.
         */
        String storeName() {
            if (kings) {
                return KINGS;
            }
            String chain = knownChain(header);
            if (chain != null) {
                return chain;
            }
            for (String line : header) {
                String name = line.replaceFirst("(?i)^welcome to\\s+", "").trim();
                if (NAME_LIKE.matcher(name).matches()
                        && !HEADER_NOISE.matcher(name.toUpperCase(Locale.ROOT)).find()
                        && name.chars().filter(Character::isLetter).count() >= 3) {
                    return name.equals(name.toUpperCase(Locale.ROOT)) ? titleCase(name) : name;
                }
            }
            return null;
        }
    }

    // --- Pieces of a line ---

    private static Money money(String line) {
        Matcher m = MONEY.matcher(line);
        if (!m.matches()) {
            return null;
        }
        BigDecimal amount = new BigDecimal(m.group("amount"));
        boolean negative = m.group("neg") != null || m.group("trail") != null;
        return new Money(m.group("text").trim(), amount, negative);
    }

    private static Measure measure(String line) {
        Matcher m = MEASURE.matcher(line);
        if (!m.matches()) {
            return null;
        }
        BigDecimal amount = null;
        String rest = m.group("rest");
        if (rest != null && !rest.isBlank()) {
            Money money = money(rest.trim());
            if (money == null || !money.text().isEmpty() || money.negative()) {
                return null;
            }
            amount = money.amount();
        }
        String qtyText = m.group("qty");
        BigDecimal quantity = new BigDecimal(qtyText);
        BigDecimal each = new BigDecimal(m.group("each"));
        if (quantity.signum() <= 0) {
            return null;
        }
        String unit = unit(m.group("unit"));
        if (unit == null) {
            unit = unit(m.group("per"));
        }
        if (unit == null && qtyText.contains(".")) {
            // "1.32 @ 2.99": nobody buys 1.32 of something by the each. US tills weigh in pounds.
            unit = "lb";
        }
        BigDecimal unitPrice = each;
        if (m.group("deal") != null) {
            // "2/5.00" is two for five dollars: 2.50 each.
            unitPrice = each.divide(new BigDecimal(m.group("deal")), 3, RoundingMode.HALF_UP);
        }
        return new Measure(quantity, unit, money(unitPrice), amount);
    }

    /** lb, kg or oz; "each" and nothing are both null. */
    private static String unit(String raw) {
        if (raw == null) {
            return null;
        }
        String unit = raw.toLowerCase(Locale.ROOT);
        return switch (unit) {
            case "lb", "lbs" -> "lb";
            case "kg", "oz" -> unit;
            default -> null;
        };
    }

    /** At least two decimal places, and no more than the three a per-lb price can need. */
    private static BigDecimal money(BigDecimal value) {
        BigDecimal stripped = value.stripTrailingZeros();
        return stripped.scale() < 2 ? value.setScale(2, RoundingMode.HALF_UP)
                : stripped.setScale(Math.min(stripped.scale(), 3), RoundingMode.HALF_UP);
    }

    /**
     * The first date that could be a shopping day: 10/18/26, 10/18/2026, 10-18-2026 or
     * 2026-10-18, maybe with a time after it. Something that is not a real day — 13/45/26 — is not
     * a date, and neither is one from before this century.
     */
    static LocalDate dateIn(String line) {
        Matcher iso = ISO_DATE.matcher(line);
        while (iso.find()) {
            LocalDate date = date(Integer.parseInt(iso.group(1)), Integer.parseInt(iso.group(2)),
                    Integer.parseInt(iso.group(3)));
            if (date != null) {
                return date;
            }
        }
        Matcher us = SLASH_DATE.matcher(line);
        while (us.find()) {
            int year = Integer.parseInt(us.group(3));
            if (us.group(3).length() == 2) {
                year += 2000;
            }
            LocalDate date = date(year, Integer.parseInt(us.group(1)), Integer.parseInt(us.group(2)));
            if (date != null) {
                return date;
            }
        }
        return null;
    }

    private static LocalDate date(int year, int month, int day) {
        if (year < 2000 || year > 2099) {
            return null;
        }
        try {
            return LocalDate.of(year, month, day);
        } catch (DateTimeException e) {
            return null;
        }
    }

    /** The words before an amount, in capitals, without the stars and dashes a till pads them with. */
    private static String label(String text) {
        return text.toUpperCase(Locale.ROOT).replaceAll("^[^A-Z0-9]+|[^A-Z0-9]+$", "");
    }

    /** A row of stars, dashes or equals signs, maybe with a stray letter the reading saw in it. */
    static boolean decoration(String line) {
        long marks = line.chars().filter(c -> c == '*' || c == '-' || c == '=' || c == '#' || c == '_').count();
        return line.length() >= 6 && marks >= line.replace(" ", "").length() * 0.6;
    }

    /** Chains a receipt names at its head, as they write themselves. */
    private static final List<String> CHAINS = List.of(
            "ShopRite", "Whole Foods Market", "Trader Joe's", "Stop & Shop", "ACME Markets", "Wegmans", "Target",
            "Costco", "Walmart", "Aldi", "Lidl", "Key Food", "Morton Williams", "H Mart", "Fairway Market",
            "Foodtown", "Food Bazaar", "Stew Leonard's", "The Fresh Market", "Sprouts", "Safeway", "Kroger",
            "Publix", "Giant", "Hannaford", "Gristedes", "D'Agostino", "C-Town", "Western Beef", "Uncle Giuseppe's",
            "BJ's", "Food Lion", "Harris Teeter", "Meijer", "Hy-Vee", "Albertsons", "Ralphs", "Vons", "Jewel-Osco");

    /**
     * A known chain named in the receipt's head, allowing for a letter or two the reading got
     * wrong — "Welcune to ShapRite" is ShopRite.
     */
    static String knownChain(List<String> head) {
        for (String line : head) {
            List<String> words = Arrays.stream(line.toLowerCase(Locale.ROOT).replaceAll("['’&.\\-]", "")
                    .split("[^a-z]+")).filter(w -> !w.isEmpty()).toList();
            for (String chain : CHAINS) {
                String key = chain.toLowerCase(Locale.ROOT).replaceAll("[^a-z]", "");
                int span = chain.split("[\\s-]+").length;
                for (int i = 0; i + span <= words.size(); i++) {
                    String said = String.join("", words.subList(i, i + span));
                    int allowed = key.length() >= 8 ? 2 : key.length() >= 5 ? 1 : 0;
                    if (said.length() >= 3 && editDistance(said, key) <= allowed) {
                        return chain;
                    }
                }
            }
        }
        return null;
    }

    static int editDistance(String a, String b) {
        int[] row = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) {
            row[j] = j;
        }
        for (int i = 1; i <= a.length(); i++) {
            int diagonal = row[0];
            row[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int above = row[j];
                row[j] = Math.min(Math.min(row[j] + 1, row[j - 1] + 1), diagonal + (a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1));
                diagonal = above;
            }
        }
        return row[b.length()];
    }

    private static boolean hasLetters(String text) {
        return text.chars().filter(Character::isLetter).count() >= 2;
    }

    private static String titleCase(String text) {
        return Arrays.stream(text.toLowerCase(Locale.ROOT).split(" "))
                .map(word -> word.isEmpty() ? word : Character.toUpperCase(word.charAt(0)) + word.substring(1))
                .collect(Collectors.joining(" "));
    }

    // --- What a line counts as ---

    /**
     * The household's ingredient a line most likely is. The line's words, without the shop's own
     * brand, sizes and numbers ("KNGS BABY SPINACH 5OZ" is baby spinach), are compared with each
     * ingredient's, singular or plural alike. An ingredient is only a candidate when the line has
     * all its words, or at least the last one — "baby spinach" for a line that just says SPINACH,
     * but never "chicken thighs" for CHICKEN BROTH. The most words in common wins, then the
     * ingredient the line covers more of, then the shorter name.
     */
    static Optional<KnownIngredient> guessIngredient(String text, Collection<KnownIngredient> ingredients) {
        Set<String> said = words(text);
        if (said.isEmpty()) {
            return Optional.empty();
        }
        record Candidate(KnownIngredient ingredient, int shared, double covered) {
        }
        return ingredients.stream()
                .filter(Objects::nonNull)
                .map(ingredient -> {
                    List<String> name = List.copyOf(words(ingredient.name()));
                    if (name.isEmpty()) {
                        return null;
                    }
                    int shared = (int) name.stream().filter(said::contains).count();
                    boolean headMatches = said.contains(name.get(name.size() - 1));
                    if (shared == 0 || (shared < name.size() && !headMatches)) {
                        return null;
                    }
                    return new Candidate(ingredient, shared, (double) shared / name.size());
                })
                .filter(Objects::nonNull)
                .max(Comparator.comparingInt(Candidate::shared)
                        .thenComparingDouble(Candidate::covered)
                        .thenComparing(c -> -c.ingredient().name().length()))
                .map(Candidate::ingredient);
    }

    /** The words that say what something is, in order, each in its singular. */
    static Set<String> words(String text) {
        Set<String> words = new LinkedHashSet<>();
        for (String said : text.toLowerCase(Locale.ROOT).split("[^a-z]+")) {
            // A till's abbreviation is read as the word it stands for, maybe two ("evoo").
            for (String word : ABBREVIATIONS.getOrDefault(said, said).split(" ")) {
                if (word.length() < 2 || NOT_WHAT_IT_IS.contains(word)) {
                    continue;
                }
                words.add(singular(word));
            }
        }
        return words;
    }

    /** tomatoes → tomato, berries → berry, eggs → egg; glass stays glass. */
    static String singular(String word) {
        if (word.length() > 4 && word.endsWith("ies")) {
            return word.substring(0, word.length() - 3) + "y";
        }
        if (word.length() > 4 && (word.endsWith("oes") || word.endsWith("ches") || word.endsWith("shes"))) {
            return word.substring(0, word.length() - 2);
        }
        if (word.length() > 3 && word.endsWith("s") && !word.endsWith("ss")) {
            return word.substring(0, word.length() - 1);
        }
        return word;
    }
}
