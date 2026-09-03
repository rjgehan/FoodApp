package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Somewhere you eat instead of cooking — a restaurant, a takeaway, or just "pizza".
 *
 * Saved per household rather than typed into each meal slot, because the same few places come
 * round every week and the menu link and phone number are worth keeping. Only the name is
 * required, so "Chinese" on a Thursday is a perfectly good Place.
 */
@Entity
@Table(name = "places", uniqueConstraints = @UniqueConstraint(columnNames = {"household_id", "name"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Place {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    @Column(nullable = false)
    private String name;

    /** Their menu. http(s) only — it is rendered as a link. */
    private String menuUrl;

    /** Becomes a tel: link, which is what you actually want at 6pm on a Friday. */
    private String phone;

    private String notes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "image_id")
    private StoredImage image;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
