package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.Household;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface HouseholdRepository extends JpaRepository<Household, UUID> {
}
