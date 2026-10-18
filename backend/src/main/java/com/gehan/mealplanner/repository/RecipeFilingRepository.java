package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.RecipeFiling;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RecipeFilingRepository extends JpaRepository<RecipeFiling, UUID> {
    List<RecipeFiling> findByHouseholdId(UUID householdId);
    Optional<RecipeFiling> findByHouseholdIdAndRecipeId(UUID householdId, UUID recipeId);
    void deleteByRecipeId(UUID recipeId);

    /** Every household's filing of these recipes — for finding which drawer the owner keeps each in. */
    List<RecipeFiling> findByRecipeIdIn(java.util.Collection<UUID> recipeIds);

    /**
     * This household's filings of these recipes, tags and all — one query for a whole selection
     * being tagged at once, rather than one per recipe and another for each one's tags.
     */
    @Query("""
            select distinct f from RecipeFiling f
            left join fetch f.categories
            where f.household.id = :householdId and f.recipe.id in :recipeIds
            """)
    List<RecipeFiling> findWithTags(@Param("householdId") UUID householdId,
                                    @Param("recipeIds") Collection<UUID> recipeIds);

    /** The filings wearing one tag, with all their tags — what deleting that tag has to touch. */
    @Query("""
            select distinct f from RecipeFiling f
            left join fetch f.categories
            where f.id in (select g.id from RecipeFiling g join g.categories c where c.id = :categoryId)
            """)
    List<RecipeFiling> findTaggedWith(@Param("categoryId") UUID categoryId);

    /**
     * How many of this household's recipes wear each of its tags, as (tag id, count) pairs — one
     * grouped query for the whole list. A tag nobody wears is simply missing.
     */
    @Query("""
            select c.id, count(distinct f.id) from RecipeFiling f join f.categories c
            where f.household.id = :householdId
            group by c.id
            """)
    List<Object[]> countTagged(@Param("householdId") UUID householdId);

    /** How many of this household's recipes wear one tag. */
    @Query("""
            select count(distinct f.id) from RecipeFiling f join f.categories c
            where f.household.id = :householdId and c.id = :categoryId
            """)
    long countTaggedWith(@Param("householdId") UUID householdId, @Param("categoryId") UUID categoryId);
}
