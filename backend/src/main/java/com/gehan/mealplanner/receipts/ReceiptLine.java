package com.gehan.mealplanner.receipts;

import com.gehan.mealplanner.domain.Ingredient;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One thing bought, as the receipt printed it — "KNGS BABY SPINACH 5OZ" — with what was actually
 * paid for it once its discounts came off, and the ingredient somebody said it counts as.
 *
 * {@link #kind} is a string key ({@link #ITEM} or {@link #NOT_FOOD}) rather than an enum column:
 * Hibernate writes an enum's values into a CHECK constraint when it makes the column and never
 * updates it, which is what SchemaTouchUps had to undo for the aisles.
 */
@Entity
@Table(name = "receipt_lines", indexes = @Index(name = "idx_receipt_lines_receipt", columnList = "receipt_id"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReceiptLine {

    /** Food, or something else from the shop that a price is worth knowing for. */
    public static final String ITEM = "ITEM";
    /** Bags, bottle deposits, gift cards: paid for, but not something to price. */
    public static final String NOT_FOOD = "NOT_FOOD";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "receipt_id", nullable = false)
    private Receipt receipt;

    /** Where it was on the receipt, from 0. */
    @Column(nullable = false)
    private int position;

    @Column(nullable = false, length = 200)
    private String text;

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String kind = ITEM;

    /** How many, or how much by weight. Null is one. */
    @Column(precision = 10, scale = 3)
    private BigDecimal quantity;

    /** "lb" for something weighed. Null is each. */
    @Column(length = 20)
    private String unit;

    /** The price per {@link #unit}, or each, when the receipt printed one. */
    @Column(precision = 10, scale = 3)
    private BigDecimal unitPrice;

    /** What was actually paid for the line, after its discounts. */
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;

    @Column(nullable = false)
    @Builder.Default
    private boolean onSale = false;

    /** What it counts as. Null when nobody said, and then it taught the app no price. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ingredient_id")
    private Ingredient ingredient;
}
