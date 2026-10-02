package com.gehan.mealplanner.nutrition;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Which build of a bundled data file is in the database, so a restart only reloads it when the
 * file shipped with the app has actually changed. The version is a hash of the file itself.
 */
@Entity
@Table(name = "nutrition_data_versions")
@Getter
@NoArgsConstructor
public class NutritionDataVersion {

    @Id
    @Column(length = 40)
    private String name;

    @Column(nullable = false, length = 80)
    private String version;

    private int rowCount;

    private Instant loadedAt;
}
