package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.IdeaVote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface IdeaVoteRepository extends JpaRepository<IdeaVote, UUID> {

    /** Every idea that has any votes, and how many: pairs of [idea id, count]. */
    @Query("SELECT v.idea.id, count(v) FROM IdeaVote v GROUP BY v.idea.id")
    List<Object[]> countByIdea();

    @Query("SELECT v.idea.id FROM IdeaVote v WHERE v.user.id = :userId")
    List<UUID> findIdeaIdsVotedBy(@Param("userId") UUID userId);

    long countByIdeaId(UUID ideaId);

    boolean existsByIdeaIdAndUserId(UUID ideaId, UUID userId);
}
