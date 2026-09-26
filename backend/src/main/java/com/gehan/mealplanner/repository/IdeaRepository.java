package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.Idea;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface IdeaRepository extends JpaRepository<Idea, UUID> {

    /** The whole board with each author's name, in one query rather than one per card. */
    @Query("SELECT i FROM Idea i LEFT JOIN FETCH i.author")
    List<Idea> findAllWithAuthor();

    long countByAuthorIdAndCreatedAtAfter(UUID authorId, Instant after);
}
