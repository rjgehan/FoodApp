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

    /**
     * What this person signs in with from now on, trimmed and lowercased on the way in so that
     * "Ryan@Gmail.com " and "ryan@gmail.com" are one address. Null until they add one — every
     * account made before email sign-in starts without. One account per address is enforced by
     * a unique index on lower(email) (see SchemaTouchUps), not only by the code that checks first.
     */
    @Column(length = 254)
    private String email;

    /**
     * BCrypt hash of the sign-in password. A column of its own: "password_hash" was taken long
     * ago by the PIN (see pinHash), and an account keeps both while the PIN screens are still on.
     */
    @Column(name = "login_password_hash")
    private String passwordHash;

    /**
     * The household they were last looking at, so signing in lands there rather than in
     * whichever house they happened to join first. No foreign key on purpose: deleting a
     * household is ordered SQL that knows nothing of this, and a stale id is simply ignored.
     */
    private UUID lastHouseholdId;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
