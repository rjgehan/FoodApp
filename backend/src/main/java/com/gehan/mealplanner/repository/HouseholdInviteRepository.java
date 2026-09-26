package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.HouseholdInvite;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface HouseholdInviteRepository extends JpaRepository<HouseholdInvite, UUID> {

    Optional<HouseholdInvite> findByToken(String token);

    /**
     * Just the house a link is for, without loading the link itself — so the house can be locked
     * before anything about the link is read. See InviteService.lockedLiveInvite.
     */
    @Query("SELECT i.household.id FROM HouseholdInvite i WHERE i.token = :token")
    Optional<UUID> findHouseholdIdByToken(@Param("token") String token);

    /** Every link not yet thrown away — normally one, possibly one that has run out of time. */
    List<HouseholdInvite> findByHouseholdIdAndRevokedAtIsNull(UUID householdId);
}
