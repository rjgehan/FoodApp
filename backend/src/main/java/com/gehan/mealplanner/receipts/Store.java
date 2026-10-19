package com.gehan.mealplanner.receipts;

import com.gehan.mealplanner.domain.Household;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * A shop this household buys from, named as its receipts head themselves — "Kings Food Markets".
 * Only so a price can say where it was paid: $3.49 at Kings is not $3.49 at the corner shop. Made
 * the first time a receipt or a typed price names it, and never shared between households.
 *
 * One per name per household, whatever the case: a unique index on lower(name), made in
 * SchemaTouchUps as the tag names' is, since an expression index is not something Hibernate makes.
 */
@Entity
@Table(name = "stores")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Store {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
