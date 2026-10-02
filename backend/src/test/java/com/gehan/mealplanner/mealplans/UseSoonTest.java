package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.domain.StoreSection;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/** "Use soon": a typed date is a fact, otherwise a labelled guess from what it is and when it came in. */
class UseSoonTest {

    /** A Wednesday. */
    static final LocalDate TODAY = LocalDate.of(2026, 10, 7);

    @Test
    void aDateWithinThreeDaysIsSoonAndSaysWhichDay() {
        UseSoon.Verdict v = UseSoon.of("Spinach", StoreSection.PRODUCE, TODAY.plusDays(1), TODAY, false, TODAY);
        assertThat(v.soon()).isTrue();
        assertThat(v.reason()).isEqualTo(UseSoon.Reason.DATE);
        assertThat(v.label()).isEqualTo("tomorrow");
        assertThat(UseSoon.of("Chicken thighs", StoreSection.MEAT, TODAY.plusDays(3), TODAY, false, TODAY).label())
                .isEqualTo("by Sat");
        assertThat(UseSoon.of("Milk", StoreSection.DAIRY, TODAY, TODAY, false, TODAY).label()).isEqualTo("today");
        assertThat(UseSoon.of("Milk", StoreSection.DAIRY, TODAY.minusDays(1), TODAY, false, TODAY).label())
                .isEqualTo("past its date");
    }

    @Test
    void aDateFurtherOutIsNotSoonButStillLabelled() {
        UseSoon.Verdict v = UseSoon.of("Cheddar", StoreSection.DAIRY, TODAY.plusDays(10), TODAY, false, TODAY);
        assertThat(v.soon()).isFalse();
        assertThat(v.label()).isEqualTo("by 17 Oct");
    }

    @Test
    void aTypedDateBeatsTheGuessEvenForAStaple() {
        assertThat(UseSoon.of("Butter", StoreSection.DAIRY, TODAY.plusDays(2), TODAY.minusDays(60), true, TODAY).soon())
                .isTrue();
        assertThat(UseSoon.of("Butter", StoreSection.DAIRY, null, TODAY.minusDays(60), true, TODAY).soon()).isFalse();
    }

    @Test
    void withoutADateFreshThingsAreGuessedFromWhenTheyWereBought() {
        // Fish keeps two days: bought yesterday, it wants using.
        UseSoon.Verdict fish = UseSoon.of("Salmon fillets", StoreSection.MEAT, null, TODAY.minusDays(1), false, TODAY);
        assertThat(fish.soon()).isTrue();
        assertThat(fish.reason()).isEqualTo(UseSoon.Reason.GUESS);
        assertThat(fish.label()).isEqualTo("soon");
        // Onions keep weeks.
        assertThat(UseSoon.of("Red onions", StoreSection.PRODUCE, null, TODAY.minusDays(3), false, TODAY).soon()).isFalse();
        // Produce in general: about five days, so soon from the second day.
        assertThat(UseSoon.of("Romanesco", StoreSection.PRODUCE, null, TODAY, false, TODAY).soon()).isFalse();
        assertThat(UseSoon.of("Romanesco", StoreSection.PRODUCE, null, TODAY.minusDays(2), false, TODAY).soon()).isTrue();
    }

    @Test
    void tinsDriedAndFrozenThingsKeep() {
        assertThat(UseSoon.shelfDays("Chickpeas (tin)", StoreSection.PRODUCE)).isEmpty();
        assertThat(UseSoon.shelfDays("Tinned tomatoes", null)).isEmpty();
        assertThat(UseSoon.shelfDays("Frozen peas", StoreSection.FROZEN)).isEmpty();
        assertThat(UseSoon.shelfDays("Dried coriander", null)).isEmpty();
        assertThat(UseSoon.shelfDays("Rice", StoreSection.DRY_GOODS)).isEmpty();
        assertThat(UseSoon.shelfDays("Peanut butter", null)).isEmpty();
        assertThat(UseSoon.shelfDays("Chicken stock", null)).isEmpty();
    }

    @Test
    void theAisleDecidesWhatPepperIs() {
        assertThat(UseSoon.shelfDays("Pepper", StoreSection.SPICES)).isEmpty();
        assertThat(UseSoon.shelfDays("Black pepper", null)).isEmpty();
        assertThat(UseSoon.shelfDays("Red pepper", StoreSection.PRODUCE)).contains(7);
    }

    @Test
    void theShortestLivedRuleWins() {
        assertThat(UseSoon.shelfDays("Beef mince", StoreSection.MEAT)).contains(2);
        assertThat(UseSoon.shelfDays("Chicken thighs", StoreSection.MEAT)).contains(3);
        assertThat(UseSoon.shelfDays("Baby spinach", StoreSection.PRODUCE)).contains(3);
        assertThat(UseSoon.shelfDays("Greek yogurt", StoreSection.DAIRY)).contains(10);
        assertThat(UseSoon.shelfDays("Eggs", StoreSection.DAIRY)).contains(21);
        assertThat(UseSoon.shelfDays("Something odd", null)).isEmpty();
        assertThat(UseSoon.shelfDays("Something odd", StoreSection.DAIRY)).contains(7);
    }

    @Test
    void aGuessLongRunOutIsLeftAlone() {
        // Spinach "bought" two months ago is long gone, or in the freezer; nagging helps nobody.
        assertThat(UseSoon.of("Spinach", StoreSection.PRODUCE, null, TODAY.minusDays(60), false, TODAY).soon()).isFalse();
    }
}
