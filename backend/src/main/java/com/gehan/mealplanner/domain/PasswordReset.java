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
 * A one-time link a household owner makes for someone who forgot their password. There is no
 * email sending in this app, so the owner hands the link over themselves — a text, or a QR code
 * held up across the kitchen.
 *
 * Only a SHA-256 of the token is kept. The link is a key to somebody's account for a day, and a
 * copy of the database should not be a drawer full of those keys.
 */
@Entity
@Table(name = "password_resets")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PasswordReset {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Hex SHA-256 of the token in the link. */
    @Column(nullable = false, unique = true, length = 64)
    private String tokenHash;

    /** Whose password the link sets. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** The owner who made it — kept so it is clear later who handed out a way in. */
    @Column(nullable = false)
    private UUID createdBy;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant expiresAt;

    /** Set once the link has been used, or replaced by a newer one for the same person. */
    private Instant usedAt;

    public boolean isLive(Instant now) {
        return usedAt == null && now.isBefore(expiresAt);
    }
}
