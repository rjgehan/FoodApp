package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.PasswordReset;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PasswordResetRepository extends JpaRepository<PasswordReset, UUID> {

    Optional<PasswordReset> findByTokenHash(String tokenHash);

    List<PasswordReset> findByUserIdAndUsedAtIsNull(UUID userId);

    /**
     * Marks a link used only if it still was unused and in date, in one statement. Returns how
     * many rows changed — 1 for whoever got there first, 0 for anyone racing them.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Query("UPDATE PasswordReset r SET r.usedAt = :now WHERE r.id = :id AND r.usedAt IS NULL AND r.expiresAt > :now")
    int spend(@Param("id") UUID id, @Param("now") Instant now);
}
