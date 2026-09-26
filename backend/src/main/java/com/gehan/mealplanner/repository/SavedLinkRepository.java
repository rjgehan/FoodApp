package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.SavedLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface SavedLinkRepository extends JpaRepository<SavedLink, UUID> {

    /** What one person sees: the household's shared links, and their own "just me" ones. */
    @Query("select l from SavedLink l left join fetch l.createdBy where l.household.id = :householdId"
            + " and (l.personal = false or l.createdBy.id = :userId) order by l.createdAt desc")
    List<SavedLink> findVisible(@Param("householdId") UUID householdId, @Param("userId") UUID userId);
}
