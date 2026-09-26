package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.HouseholdInvite;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface HouseholdInviteRepository extends JpaRepository<HouseholdInvite, UUID> {

    Optional<HouseholdInvite> findByToken(String token);

    /** Every link not yet thrown away — normally one, possibly one that has run out of time. */
    List<HouseholdInvite> findByHouseholdIdAndRevokedAtIsNull(UUID householdId);
}
