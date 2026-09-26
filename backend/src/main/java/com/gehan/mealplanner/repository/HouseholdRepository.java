package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.Household;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface HouseholdRepository extends JpaRepository<Household, UUID> {

    /**
     * The household, with its row locked until the transaction ends — so two people opening the
     * Invite card at the same moment queue up behind each other instead of making a link each.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT h FROM Household h WHERE h.id = :id")
    Optional<Household> lockById(@Param("id") UUID id);
}
