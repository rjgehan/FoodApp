package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.GroceryCategory;
import com.gehan.mealplanner.domain.StoreSection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GroceryCategoryRepository extends JpaRepository<GroceryCategory, UUID> {
    List<GroceryCategory> findByHouseholdIdOrderByPosition(UUID householdId);

    boolean existsByHouseholdId(UUID householdId);

    Optional<GroceryCategory> findByHouseholdIdAndSeededFrom(UUID householdId, StoreSection seededFrom);
}
