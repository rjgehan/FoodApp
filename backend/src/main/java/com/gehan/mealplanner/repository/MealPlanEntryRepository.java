package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.MealPlanEntry;
import com.gehan.mealplanner.domain.MealType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface MealPlanEntryRepository extends JpaRepository<MealPlanEntry, UUID> {

    /** Used when a place is deleted, so the plan never points at something that is gone. */
    void deleteByPlaceId(UUID placeId);

    List<MealPlanEntry> findByHouseholdIdAndDateBetweenOrderByDateAscMealTypeAsc(
            UUID householdId, LocalDate start, LocalDate end);

    /** A slot holds several recipes now — a main plus its sides — so this is a list, not an Optional. */
    List<MealPlanEntry> findByHouseholdIdAndDateAndMealTypeOrderByCreatedAtAsc(
            UUID householdId, LocalDate date, MealType mealType);
}
