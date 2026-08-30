package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.SectionIcon;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SectionIconRepository extends JpaRepository<SectionIcon, UUID> {
    List<SectionIcon> findByHouseholdId(UUID householdId);
    Optional<SectionIcon> findByHouseholdIdAndSection(UUID householdId, RecipeSection section);
}
