package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.Recipe;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface RecipeRepository extends JpaRepository<Recipe, UUID> {
    List<Recipe> findByHouseholdId(UUID householdId);

    /** A household's own recipes plus any recipe another household has shared with it. */
    @Query("""
            select distinct r from Recipe r
            left join RecipeShare s on s.recipe = r
            where r.household.id = :householdId or s.household.id = :householdId
            """)
    List<Recipe> findVisibleTo(@Param("householdId") UUID householdId);
}
