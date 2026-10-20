package com.gehan.mealplanner.receipts;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface HiddenPlaceRepository extends JpaRepository<HiddenPlace, UUID> {

    List<HiddenPlace> findByHouseholdIdOrderByHiddenAtDesc(UUID householdId);

    Optional<HiddenPlace> findByIdAndHouseholdId(UUID id, UUID householdId);
}
