package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "ingredients", uniqueConstraints = @UniqueConstraint(columnNames = "normalizedName"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Ingredient {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    /** Lowercased, trimmed form of {@link #name} used to dedupe/aggregate across recipes. */
    @Column(nullable = false)
    private String normalizedName;

    private String defaultUnit;
}
