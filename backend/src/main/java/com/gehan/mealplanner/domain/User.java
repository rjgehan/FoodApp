package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String username;

    /**
     * BCrypt hash of the user's numeric PIN, or null until they first sign in — accounts are
     * created for people by someone else in their household, and pick a PIN on first use.
     *
     * Deliberately still mapped to the original "password_hash" column: Hibernate runs with
     * ddl-auto=update, which would add a new column but never drop the old NOT NULL one,
     * breaking every insert. See SchemaTouchUps for the matching nullability fix.
     */
    @Column(name = "password_hash")
    private String pinHash;

    @Column(nullable = false)
    private String displayName;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
