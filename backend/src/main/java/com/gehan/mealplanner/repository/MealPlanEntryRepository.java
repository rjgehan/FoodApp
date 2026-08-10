package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.MealPlanEntry;
import com.gehan.mealplanner.domain.MealType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MealPlanEntryRepository extends JpaRepository<MealPlanEntry, UUID> {
    List<MealPlanEntry> findByHouseholdIdAndDateBetweenOrderByDateAscMealTypeAsc(
            UUID householdId, LocalDate start, LocalDate end);

    Optional<MealPlanEntry> findByHouseholdIdAndDateAndMealType(
            UUID householdId, LocalDate date, MealType mealType);
}
