package com.gehan.mealplanner.receipts;

import com.gehan.mealplanner.domain.Household;
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
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A till receipt somebody scanned and checked on their phone, kept as it was confirmed: its lines,
 * what it said the totals were, and the text the phone read off it. The prices it taught the app
 * are {@link PriceObservation}s pointing at its lines, so deleting a receipt takes them back.
 *
 * The barcode carries nothing useful on the receipts the owner checked. It is kept only to notice
 * the same receipt scanned twice — unique per household where there is one, by a partial index
 * in SchemaTouchUps, so "Save anyway" means saving without it.
 */
@Entity
@Table(name = "receipts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Receipt {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    /** Null when nobody could say which shop it was from. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "store_id")
    private Store store;

    /** The day on the receipt. Null when it could not be read and nobody picked one. */
    private LocalDate purchasedOn;

    @Column(precision = 10, scale = 2)
    private BigDecimal subtotal;

    @Column(precision = 10, scale = 2)
    private BigDecimal tax;

    @Column(precision = 10, scale = 2)
    private BigDecimal total;

    @Column(length = 120)
    private String barcode;

    /** Every line the phone read, as it read them — for putting the reader right later. */
    @Column(columnDefinition = "text")
    private String rawText;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id")
    private User createdBy;

    @OneToMany(mappedBy = "receipt", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position")
    @Builder.Default
    private List<ReceiptLine> lines = new ArrayList<>();

    /**
     * The scanned pages, as stored images of the household's, in order: to look back at, and to
     * check the reader against what was really printed. Deleted with the receipt.
     */
    /** The branch it was bought at, when somebody linked it to one. */
    @Embedded
    private StorePlace place;

    @ElementCollection
    @CollectionTable(name = "receipt_photos", joinColumns = @JoinColumn(name = "receipt_id"))
    @Column(name = "image_id", nullable = false)
    @OrderColumn(name = "position")
    @Builder.Default
    private List<UUID> photoIds = new ArrayList<>();

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
