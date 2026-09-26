package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicUpdate;

import java.time.Instant;
import java.util.UUID;

/**
 * The link that lets somebody into a household — sent as a message, or held up as a QR code.
 * Opening it and saying yes is the only way into a house somebody else made, so nobody ends up
 * in one without having agreed to it.
 *
 * One live link per household, shared by everyone in it: any member can show it, and the owner
 * can throw it away and get a new one. The token is kept as it is rather than hashed, unlike a
 * password reset, because the whole point is that anyone in the house can open the Invite card
 * and see the same link again. It opens a door into a kitchen, not into somebody's account.
 *
 * Saved a column at a time ({@code @DynamicUpdate}): counting one more person in writes the
 * count and nothing else, so it can never put back a revokedAt it read before the link was
 * thrown away.
 */
@Entity
@DynamicUpdate
@Table(name = "household_invites")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HouseholdInvite {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    /** 32 random bytes, URL-safe base64 — the part of the link that is the key. */
    @Column(nullable = false, unique = true, length = 64)
    private String token;

    /** Whoever first asked for the link. It is their name the invitation carries. */
    @Column(nullable = false)
    private UUID createdBy;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant expiresAt;

    /** Set when the owner makes a new link, or when an out-of-date one is replaced. */
    private Instant revokedAt;

    /** How many people have come in through it. Only for the record; it never stops working. */
    @Column(nullable = false)
    @Builder.Default
    private int useCount = 0;

    public boolean isLive(Instant now) {
        return revokedAt == null && now.isBefore(expiresAt);
    }
}
