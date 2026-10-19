package com.gehan.mealplanner.receipts;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.domain.User;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * "We paid $3.49 for spinach at Kings on the 18th." One price, for one ingredient, on one day —
 * from a scanned receipt's line, or typed in on a grocery row. The grocery list shows the newest
 * one for each thing on it; everything else here is kept for what comes later (price history,
 * what a recipe costs), which is why old ones are never overwritten.
 *
 * {@link #source} is a string key ({@link #RECEIPT} or {@link #MANUAL}), not an enum column, for
 * the reason {@link ReceiptLine#getKind()} gives. The index that finds the newest price per
 * ingredient — (household_id, ingredient_id, observed_on desc) — is made in SchemaTouchUps.
 */
@Entity
@Table(name = "price_observations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PriceObservation {

    public static final String RECEIPT = "RECEIPT";
    public static final String MANUAL = "MANUAL";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    /** Null when nobody said where. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "store_id")
    private Store store;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ingredient_id", nullable = false)
    private Ingredient ingredient;

    /** What was paid — for {@link #quantity} {@link #unit} of it, or for one when those are null. */
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;

    @Column(precision = 10, scale = 3)
    private BigDecimal quantity;

    @Column(length = 20)
    private String unit;

    @Column(nullable = false)
    @Builder.Default
    private boolean onSale = false;

    @Column(nullable = false)
    private LocalDate observedOn;

    @Column(nullable = false, length = 20)
    private String source;

    /** The receipt line it came from, so deleting the receipt takes it back. Null for a typed price. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "receipt_line_id")
    private ReceiptLine receiptLine;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id")
    private User createdBy;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
