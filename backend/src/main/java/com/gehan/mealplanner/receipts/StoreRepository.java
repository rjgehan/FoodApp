package com.gehan.mealplanner.receipts;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface StoreRepository extends JpaRepository<Store, UUID> {

    List<Store> findByHouseholdIdOrderByNameAsc(UUID householdId);

    /** "kings food markets" finds "Kings Food Markets": the same index the names are unique on. */
    @Query("select s from Store s where s.household.id = :householdId and lower(s.name) = lower(:name)")
    Optional<Store> findByName(@Param("householdId") UUID householdId, @Param("name") String name);
}
