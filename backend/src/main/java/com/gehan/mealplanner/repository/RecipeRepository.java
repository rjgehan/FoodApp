package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.Recipe;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface RecipeRepository extends JpaRepository<Recipe, UUID> {
    List<Recipe> findByHouseholdId(UUID householdId);

    /**
     * A household's own recipes, plus any shared with it, plus any it has filed in its own
     * catalog — something kept from Explore stays kept, even if the owner later takes it out
     * of Explore. Only the owner deleting it takes it away.
     */
    @Query("""
            select distinct r from Recipe r
            left join RecipeShare s on s.recipe = r
            left join RecipeFiling f on f.recipe = r
            where r.household.id = :householdId
               or s.household.id = :householdId
               or f.household.id = :householdId
            """)
    List<Recipe> findVisibleTo(@Param("householdId") UUID householdId);

    /** Explore: everything any household has published, newest first. */
    List<Recipe> findByPublishedTrueOrderByPublishedAtDesc();
}
