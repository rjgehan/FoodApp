package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * "Remind me to buy this every 3 weeks" — for the things nobody plans a meal around and
 * everybody forgets until they are out: coffee filters, dish soap, the dog's food. One per
 * household and ingredient, so the grocery list and the cupboard show the same schedule.
 *
 * The clock runs from the last time it was bought, which is when it was put away through Done
 * shopping or added to the cupboard by hand. Once that plus {@link #everyDays} has passed, the
 * app asks on opening whether it is time to buy more. Nothing here puts anything on the list by
 * itself: the answer is always somebody's.
 */
@Entity
@Table(name = "restock_reminders",
        uniqueConstraints = @UniqueConstraint(columnNames = {"household_id", "ingredient_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RestockReminder {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false)
    private Household household;

    /** The same shared ingredient the grocery list and cupboard use, so the schedule follows it to both. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ingredient_id", nullable = false)
    private Ingredient ingredient;

    /** How long one lasts, in days — 21 for "every 3 weeks". */
    @Column(nullable = false)
    private int everyDays;

    @Column(nullable = false)
    private Instant lastBoughtAt;

    /**
     * "Not now" on the question: not asked about again until then. Buying it clears this, since
     * the clock has started over and the old answer was about the old one.
     */
    private Instant snoozedUntil;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    public Instant dueAt() {
        return lastBoughtAt.plus(everyDays, ChronoUnit.DAYS);
    }

    /**
     * Its time has come and nobody has said "not now" since. Whether it is already waiting on
     * the grocery list is for the caller to check, since that takes the list.
     */
    public boolean isDue(Instant now) {
        return !dueAt().isAfter(now) && (snoozedUntil == null || !snoozedUntil.isAfter(now));
    }

    /** Just bought: the clock starts over, and any "not now" is spent. */
    public void bought(Instant now) {
        lastBoughtAt = now;
        snoozedUntil = null;
    }
}
