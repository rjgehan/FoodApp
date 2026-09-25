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

    /**
     * Recipes the startup backfill may have something to move for: links still only in the old
     * single columns, or text in those columns that does not look like a link (no http, or a
     * space in it). A narrowing only — the backfill decides for each one.
     */
    @Query("""
            select r from Recipe r
            where (r.links is empty and (r.sourceUrl is not null or r.videoUrl is not null))
               or r.sourceUrl not like 'http%' or r.sourceUrl like '% %'
               or r.videoUrl not like 'http%' or r.videoUrl like '% %'
            """)
    List<Recipe> findWithLinksToMove();

    /** Recipes whose description might be nothing but an address. See the startup backfill. */
    @Query("select r from Recipe r where lower(trim(r.description)) like 'http%'")
    List<Recipe> findWithDescriptionStartingHttp();

    /** Explore: everything any household has published, newest first. */
    List<Recipe> findByPublishedTrueOrderByPublishedAtDesc();
}
