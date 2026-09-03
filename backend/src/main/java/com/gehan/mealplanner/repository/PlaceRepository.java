package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.Place;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlaceRepository extends JpaRepository<Place, UUID> {

    List<Place> findByHouseholdIdOrderByNameAsc(UUID householdId);

    Optional<Place> findByHouseholdIdAndNameIgnoreCase(UUID householdId, String name);
}
