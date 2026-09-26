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
@Table(name = "household_members", uniqueConstraints = @UniqueConstraint(columnNames = {"household_id", "user_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HouseholdMember {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private HouseholdRole role;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant joinedAt = Instant.now();

    /**
     * True when the account came into this house already made — it existed before, and the house
     * did not make it. Such a membership never lets the owner reset its password. Anyone can make
     * a house, and for an account in no other house its new "owner" would otherwise be the only
     * one who speaks for it: pulled in by a stranger, or talked into accepting a stranger's
     * invite, it could then have its password "reset" out from under the person it belongs to.
     * Saying yes to a house is not saying yes to that.
     *
     * Set by accepting an invite, and on the rows the old add-by-username made without asking
     * anybody. The column keeps its old name so those rows keep their protection.
     *
     * Null on every membership made before this was recorded, and on the ones made any other way
     * — founding a house, or signing up through its invite, which makes the account there and
     * then — which are the ones an owner can vouch for.
     */
    @Column(name = "added_without_asking")
    private Boolean broughtOwnAccount;

    public boolean cameWithOwnAccount() {
        return Boolean.TRUE.equals(broughtOwnAccount);
    }
}
