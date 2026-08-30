package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.StoredImage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface StoredImageRepository extends JpaRepository<StoredImage, UUID> {
}
