package com.gehan.mealplanner.receipts;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public class ReceiptDtos {

    /** Far beyond any grocery receipt, and well inside the numeric(10,2) the prices are kept in. */
    public static final String MAX_MONEY = "99999.99";
    public static final String TOO_BIG = "That amount looks too big for a grocery receipt.";
    public static final String MAX_QUANTITY = "99999";
    public static final String TOO_MUCH = "That quantity looks too big.";

    /**
     * What the phone read off a receipt: its text, a row at a time in reading order, with the
     * words on one row joined by a space — and the first barcode it saw, if any, only for
     * spotting the same receipt scanned twice.
     */
    public record ReadReceiptRequest(
            @NotEmpty(message = "There was no text to read. Try scanning the receipt again.")
            @Size(max = 2000, message = "That's more text than a receipt has. Try scanning it again.")
            List<String> lines,
            @Size(max = 120) String barcode) {
    }

    /**
     * The receipt as {@link ReceiptReader} understood it, for somebody to check before anything is
     * saved. `storeId` is the household's own store of that name, when it has one. `sumMatches`
     * says whether the lines add up to the subtotal (to the cent or two), and is null when no
     * subtotal was read. `duplicateOf` is a receipt already saved with the same barcode. Lines it
     * could not make sense of are in `unreadLines`, never just dropped.
     */
    public record ReceiptDraft(
            String storeName,
            UUID storeId,
            LocalDate purchasedOn,
            BigDecimal subtotal,
            BigDecimal tax,
            BigDecimal total,
            Boolean sumMatches,
            UUID duplicateOf,
            List<DraftLine> lines,
            List<String> unreadLines) {

        ReceiptDraft withDuplicateOf(UUID receiptId) {
            return new ReceiptDraft(storeName, storeId, purchasedOn, subtotal, tax, total, sumMatches, receiptId,
                    lines, unreadLines);
        }
    }

    /**
     * One thing bought. `kind` is ITEM or NOT_FOOD. `quantity` null is one and `unit` null is
     * each; `unitPrice` is what the receipt said one (or one lb) cost, when it said. `price` is
     * what was paid for the line after its discounts, and `onSale` says a discount came off.
     * The ingredient is the reader's guess from the household's own — null when it had none.
     */
    public record DraftLine(
            String text,
            String kind,
            BigDecimal quantity,
            String unit,
            BigDecimal unitPrice,
            BigDecimal price,
            boolean onSale,
            UUID ingredientId,
            String ingredientName) {
    }

    /**
     * The receipt as somebody confirmed it. The store is found or made by name; leaving it blank
     * saves a receipt from nowhere in particular. A line counts as an ingredient by its id, or by
     * a name typed on the review screen, which is found or made like one typed on the list.
     */
    public record SaveReceiptRequest(
            @Size(max = 80, message = "Keep the store's name to 80 characters.") String storeName,
            LocalDate purchasedOn,
            @PositiveOrZero(message = "The subtotal can't be below zero.") @DecimalMax(value = MAX_MONEY, message = TOO_BIG) BigDecimal subtotal,
            @PositiveOrZero(message = "The tax can't be below zero.") @DecimalMax(value = MAX_MONEY, message = TOO_BIG) BigDecimal tax,
            @PositiveOrZero(message = "The total can't be below zero.") @DecimalMax(value = MAX_MONEY, message = TOO_BIG) BigDecimal total,
            @Size(max = 120) String barcode,
            String rawText,
            @NotEmpty(message = "A receipt needs at least one line.")
            @Size(max = 500, message = "That's more lines than a receipt has.")
            List<@Valid SaveLine> lines) {
    }

    public record SaveLine(
            @Size(max = 200, message = "Keep each line to 200 characters.") String text,
            String kind,
            @Positive(message = "A quantity has to be more than zero.") @DecimalMax(value = MAX_QUANTITY, message = TOO_MUCH) BigDecimal quantity,
            @Size(max = 20, message = "Keep the unit to 20 characters.") String unit,
            @PositiveOrZero(message = "A price can't be below zero.") @DecimalMax(value = MAX_MONEY, message = TOO_BIG) BigDecimal unitPrice,
            @NotNull(message = "Every line needs a price.")
            @PositiveOrZero(message = "A price can't be below zero.") @DecimalMax(value = MAX_MONEY, message = TOO_BIG) BigDecimal price,
            boolean onSale,
            UUID ingredientId,
            @Size(max = 200, message = "Keep the ingredient's name to 200 characters.") String ingredientName) {
    }

    /**
     * A saved receipt. `itemCount` is its ITEM lines; `pricedCount` those that count as an
     * ingredient, and so taught the app a price. `storeId`, `subtotal` and `tax` ride along at
     * the end for the read-only screen.
     */
    public record ReceiptResponse(
            UUID id,
            String storeName,
            LocalDate purchasedOn,
            BigDecimal total,
            int itemCount,
            int pricedCount,
            List<ReceiptLineResponse> lines,
            Instant createdAt,
            UUID storeId,
            BigDecimal subtotal,
            BigDecimal tax) {
    }

    /** The same fields as a {@link DraftLine}, plus the saved line's own id. */
    public record ReceiptLineResponse(
            String text,
            String kind,
            BigDecimal quantity,
            String unit,
            BigDecimal unitPrice,
            BigDecimal price,
            boolean onSale,
            UUID ingredientId,
            String ingredientName,
            UUID id) {
    }

    /** One row of the Receipts list: "Kings Food Markets · Oct 18 · $86.40 · 23 priced". */
    public record ReceiptSummary(
            UUID id,
            String storeName,
            LocalDate purchasedOn,
            BigDecimal total,
            int itemCount,
            int pricedCount,
            Instant createdAt) {
    }

    public record StoreResponse(UUID id, String name) {
    }

    /**
     * One chain of shops on the map of grocery stores, with what was last paid there by anybody on
     * the server: the newest price for each thing, A to Z, from every household's receipts and
     * typed prices — whose, never said; only how many `households` have priced something there,
     * and whether one of them is the asker's (`yours`). `name` is the asker's own name for the
     * chain when it has one, otherwise the name most of its receipts give.
     *
     * `listTotal` is what the asker's grocery list as it stands (the rows not yet ticked off) comes
     * to there, for the `listPriced` of its `listCount` rows that the chain has a price for. `id`
     * is the same for the same chain on every request.
     */
    public record StorePrices(
            UUID id,
            String name,
            LocalDate lastPricedOn,
            List<StoreItemPrice> prices,
            BigDecimal listTotal,
            int listPriced,
            int listCount,
            int households,
            boolean yours) {
    }

    /**
     * What one thing last cost at one chain: `price` for `quantity` `unit` of it (one, when null),
     * and whether that newest price was the asker's own household's.
     */
    public record StoreItemPrice(
            UUID ingredientId,
            String ingredientName,
            BigDecimal price,
            BigDecimal quantity,
            String unit,
            LocalDate observedOn,
            boolean onSale,
            String source,
            boolean yours) {
    }
}
