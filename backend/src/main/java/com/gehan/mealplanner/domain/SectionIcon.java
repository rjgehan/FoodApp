package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/**
 * Which built-in illustration a household picked for one of its catalog drawers. Icons are
 * drawn in the frontend and referenced by key, so nothing here stores an image.
 */
@Entity
@Table(name = "section_icons", uniqueConstraints = @UniqueConstraint(columnNames = {"household_id", "section"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SectionIcon {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RecipeSection section;

    @Column(nullable = false)
    private String iconKey;
}
