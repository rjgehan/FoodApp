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
     * True when somebody else put an existing account in here by its username, without that
     * person saying yes. Such a membership never lets the owner reset their password: anyone can
     * make a house and pull a stranger into it, and for an account in no other house that would
     * otherwise make the stranger's new "owner" the only one who speaks for it.
     *
     * Null on every membership made before this was recorded, and on the ones made any other way
     * — founding a house, being given a brand new account in it — which are the ones an owner
     * can vouch for.
     */
    private Boolean addedWithoutAsking;

    public boolean wasAddedWithoutAsking() {
        return Boolean.TRUE.equals(addedWithoutAsking);
    }
}
