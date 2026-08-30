package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Where one household files one recipe. Filing belongs to the household doing the looking, not
 * to the recipe, which is what makes sharing work: a recipe from another house has no filing of
 * yours until you move it somewhere, so it sits under "Shared" until you decide where it goes.
 * Your own recipes get a filing the moment they are created.
 */
@Entity
@Table(name = "recipe_filings", uniqueConstraints = @UniqueConstraint(columnNames = {"household_id", "recipe_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecipeFiling {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipe_id", nullable = false)
    private Recipe recipe;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private RecipeSection section = RecipeSection.OTHER;

    /** The household's own sub-categories — "Main dish", "Side", "Veggie", whatever they invent. */
    @ManyToMany
    @JoinTable(name = "recipe_filing_categories",
            joinColumns = @JoinColumn(name = "filing_id"),
            inverseJoinColumns = @JoinColumn(name = "category_id"))
    @Builder.Default
    private Set<RecipeCategory> categories = new LinkedHashSet<>();
}
