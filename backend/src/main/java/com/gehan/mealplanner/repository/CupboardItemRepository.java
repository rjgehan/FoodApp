package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.CupboardItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CupboardItemRepository extends JpaRepository<CupboardItem, UUID> {
    List<CupboardItem> findByHouseholdId(UUID householdId);

    Optional<CupboardItem> findByHouseholdIdAndIngredientId(UUID householdId, UUID ingredientId);
}
