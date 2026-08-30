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
 * An uploaded picture, already downscaled by the browser before it ever reached us. Bytes live
 * in Postgres rather than on a volume so backups stay in one piece; the size cap on upload is
 * what keeps that honest.
 */
@Entity
@Table(name = "stored_images")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StoredImage {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    @Column(nullable = false)
    private String contentType;

    @Column(nullable = false)
    private int byteSize;

    /** Lazy so listing recipes never drags image bytes along with it. */
    @Basic(fetch = FetchType.LAZY)
    @Column(name = "data", nullable = false, columnDefinition = "bytea")
    private byte[] data;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
