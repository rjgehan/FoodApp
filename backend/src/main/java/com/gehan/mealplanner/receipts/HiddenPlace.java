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
 * A place on the store map this household has said is not a grocery store — the soup kitchen
 * Apple files as a food market down the street. Hidden from every phone in the household, on the
 * map and in the list of stores a receipt can be linked to, until somebody shows it again.
 *
 * Only ever the household's own: another household's map is theirs to tidy. Matched to Apple's
 * places by name and where it stands, as the phones find them afresh on every search.
 */
@Entity
@Table(name = "hidden_places", indexes = @Index(name = "idx_hidden_places_household", columnList = "household_id"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HiddenPlace {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 200)
    private String address;

    @Column(nullable = false)
    private double latitude;

    @Column(nullable = false)
    private double longitude;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant hiddenAt = Instant.now();
}
