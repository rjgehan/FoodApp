package com.gehan.mealplanner.service;

import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedRecipe;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

/**
 * Reading which machines a recipe needs from its words. The method is written the way people
 * really write them — and the traps are the ones real recipes set: Dutch ovens, baked beans,
 * no-bake cheesecakes, grill pans, BBQ sauce, and "or in the air fryer".
 */
class ApplianceDetectorTest {

    private static Set<String> method(String instructions) {
        return ApplianceDetector.detect("Dinner", null, instructions);
    }

    // --- Named outright ---

    @Test
    void namesTheMachineInTheMethod() {
        assertThat(method("Preheat the oven to 200C.")).containsExactly("oven");
        assertThat(method("Microwave on high for 2 minutes, stirring halfway.")).containsExactly("microwave");
        assertThat(method("Put everything in the slow cooker and cook on low for 8 hours.")).containsExactly("slow-cooker");
        assertThat(method("Add to the Instant Pot. Cook on high pressure for 10 minutes, then natural release."))
                .containsExactly("pressure-cooker");
        assertThat(method("Whizz in a food processor until it comes together.")).containsExactly("food-processor");
        assertThat(method("Beat the butter and sugar with a stand mixer until pale.")).containsExactly("mixer");
        assertThat(method("Rinse the rice and cook it in the rice cooker.")).containsExactly("rice-cooker");
        assertThat(method("Blitz with a stick blender.")).containsExactly("blender");
    }

    @Test
    void airFryerInEveryWayPeopleSpellIt() {
        assertThat(method("Air fry at 200C for 12 minutes.")).containsExactly("air-fryer");
        assertThat(method("Air-fry until golden.")).containsExactly("air-fryer");
        assertThat(method("Place in the air fryer basket.")).containsExactly("air-fryer");
        assertThat(method("Pop them in the airfryer for 8 mins.")).containsExactly("air-fryer");
        assertThat(method("Air-fried until crisp, then tossed in sauce.")).containsExactly("air-fryer");
    }

    @Test
    void theNameCountsWhenItNamesAMachine() {
        assertThat(ApplianceDetector.detect("Slow cooker chili", null, "Brown the beef. Add everything else."))
                .containsExactly("slow-cooker");
        assertThat(ApplianceDetector.detect("Air fryer wings", null, null)).containsExactly("air-fryer");
        assertThat(ApplianceDetector.detect("Instant Pot risotto", null, null)).containsExactly("pressure-cooker");
        assertThat(ApplianceDetector.detect("Microwave mug cake", null, null)).containsExactly("microwave");
        assertThat(ApplianceDetector.detect("Banana smoothie", null, "Throw it all in and go.")).containsExactly("blender");
    }

    @Test
    void theNamesBakedOrBbqIsAFlavourNotAMethod() {
        assertThat(ApplianceDetector.detect("Baked beans on toast", null, "Warm the beans in a pan. Toast the bread."))
                .isEmpty();
        assertThat(ApplianceDetector.detect("BBQ chicken wraps", null, "Toss the chicken in the sauce and wrap."))
                .isEmpty();
        assertThat(ApplianceDetector.detect("Roasted red pepper soup", null, "Simmer everything for 20 minutes."))
                .isEmpty();
    }

    @Test
    void theDescriptionCountsLikeTheMethod() {
        assertThat(ApplianceDetector.detect("Mum's ziti", "Baked until bubbling, the way she made it.", null))
                .containsExactly("oven");
        assertThat(ApplianceDetector.detect("Ribs", "Best done on the barbecue.", null)).containsExactly("grill");
    }

    @Test
    void neverTheStovetopAndNeverTheIngredients() {
        assertThat(method("Fry the onion in a pan. Simmer for 20 minutes on the hob.")).isEmpty();
        assertThat(ApplianceDetector.detect("Beans on toast", null, null)).isEmpty();
        assertThat(ApplianceDetector.detect(null, null, null)).isEmpty();
    }

    @Test
    void severalAtOnceComeBackInTheCataloguesOrder() {
        assertThat(method("Blend the sauce until smooth. Pour over the chicken and bake for 30 minutes. "
                + "Meanwhile microwave the rice."))
                .containsExactly("oven", "microwave", "blender");
    }

    // --- The oven, said without the word ---

    @Test
    void bakingRoastingAndBroilingAreTheOven() {
        assertThat(method("Bake for 25 minutes until golden.")).containsExactly("oven");
        assertThat(method("Roast the vegetables for 40 minutes, turning once.")).containsExactly("oven");
        assertThat(method("Broil for 2 minutes until the cheese bubbles.")).containsExactly("oven");
        assertThat(method("Preheat to 180C and grease a tin.\nBake.")).containsExactly("oven");
        assertThat(method("Cook at gas mark 6 for half an hour.")).containsExactly("oven");
        assertThat(method("Cook at 200C (180C fan) for 20 minutes.")).containsExactly("oven");
        assertThat(method("Put the chicken in a roasting tin.")).containsExactly("oven");
        assertThat(method("Roast the vegetables on a sheet pan for 30 minutes.")).containsExactly("oven");
    }

    @Test
    void aRoastIsNotRoasting() {
        // The pot roast seared before it goes in another machine.
        assertThat(method("Sear the roast. Pressure cook for 60 minutes.")).containsExactly("pressure-cooker");
        assertThat(method("Season the roast. Place in the slow cooker and cook on low for 8 hours."))
                .containsExactly("slow-cooker");
        assertThat(method("Brown the pot roast on every side, then add the stock.")).isEmpty();
        // Roasting it still is.
        assertThat(method("Roast the lamb for 2 hours, then rest the roast for 15 minutes.")).containsExactly("oven");
    }

    @Test
    void underTheGrillIsTheOvensTopNotABarbecue() {
        assertThat(method("Finish under a hot grill until browned.")).containsExactly("oven");
        assertThat(method("Slide under the broiler for a minute.")).containsExactly("oven");
    }

    @Test
    void aDutchOvenIsAPot() {
        assertThat(method("Heat the oil in a Dutch oven and simmer the stew for 2 hours.")).isEmpty();
        assertThat(method("Preheat a Dutch oven over medium heat. Brown the beef.")).isEmpty();
        // Unless it goes in the oven, which is then said.
        assertThat(method("Brown the beef in a dutch oven, cover, and transfer to the oven for 3 hours."))
                .containsExactly("oven");
        assertThat(ApplianceDetector.detect("Dutch oven bread", null, "Bake covered for 30 minutes."))
                .containsExactly("oven");
    }

    @Test
    void bakedBeansAndBakingPowderAreNotBaking() {
        assertThat(method("Stir the baked beans through and heat gently.")).isEmpty();
        assertThat(method("Whisk the flour, baking powder and baking soda, then fry spoonfuls in a pan.")).isEmpty();
        assertThat(method("Line a tray with baking paper and freeze.")).isEmpty();
    }

    @Test
    void roastingOnTheHobIsNotTheOven() {
        assertThat(method("Dry-roast the cumin seeds, then grind.")).isEmpty();
        assertThat(method("Roast the spices in a dry pan until fragrant.")).isEmpty();
        assertThat(method("Roast the pepper directly over the flame until charred.")).isEmpty();
        assertThat(method("Roast the cumin seeds in a pan.")).isEmpty();
        assertThat(method("Roast the peppers in a grill pan until blackened.")).isEmpty();
        assertThat(method("Add the roasted red peppers and the fire-roasted tomatoes.")).isEmpty();
    }

    @Test
    void preheatingAPanOrAnotherMachineIsNotTheOven() {
        assertThat(method("Preheat a large skillet over medium heat.")).isEmpty();
        assertThat(method("Preheat the air fryer to 200C.")).containsExactly("air-fryer");
        assertThat(method("Preheat the oil to 180C.")).isEmpty();
        assertThat(method("Preheat a grill pan over medium-high heat. Cook 3 minutes a side.")).isEmpty();
        assertThat(method("Preheat a griddle pan. Cook the pancakes.")).isEmpty();
        assertThat(method("Preheat a stovetop grill and char the corn.")).isEmpty();
        assertThat(method("Preheat a large pot of salted water.")).isEmpty();
    }

    // --- Saying it is not needed ---

    @Test
    void noBakeNeverGoesInTheOvenWhateverTinItIsPressedInto() {
        assertThat(ApplianceDetector.detect("No-bake cheesecake", null,
                "Press the biscuit base into a baking tin. Chill for 4 hours.")).isEmpty();
        assertThat(ApplianceDetector.detect("No bake energy balls", null, "Mix and roll. No baking needed.")).isEmpty();
        // Its blender still counts.
        assertThat(ApplianceDetector.detect("No-bake lime pie", null, "Blend the filling until smooth."))
                .containsExactly("blender");
    }

    @Test
    void aMachineSaidNotToBeNeededIsLeftOut() {
        assertThat(method("No oven needed: everything happens in one pan.")).isEmpty();
        assertThat(method("You can make this without an oven.")).isEmpty();
        assertThat(method("No blender? Mash it with a fork.")).isEmpty();
        assertThat(method("No need for a food processor — chop by hand.")).isEmpty();
        assertThat(method("You don't need a stand mixer for this one.")).isEmpty();
        assertThat(ApplianceDetector.detect("Oven-free lasagne", null, "Layer it up in the slow cooker."))
                .containsExactly("slow-cooker");
    }

    // --- Alternatives ---

    @Test
    void anAlternativeCountsSoSomebodyWithOnlyThatMachineCanStillMakeIt() {
        assertThat(method("Bake at 220C for 15 minutes, or air fry at 200C for 10.")).containsExactly("oven", "air-fryer");
        assertThat(method("Roast for 25 minutes (or in the air fryer for 15).")).containsExactly("oven", "air-fryer");
        assertThat(method("Cook in the oven or slow cooker.")).containsExactly("oven", "slow-cooker");
        assertThat(ApplianceDetector.detect("Crispy potatoes", "Works in the air fryer too.", "Roast for 40 minutes."))
                .containsExactly("oven", "air-fryer");
    }

    @Test
    void orUntilIsNotAnAlternative() {
        assertThat(method("Bake for 20 minutes, or until golden.")).containsExactly("oven");
        assertThat(method("Air fry for 10 minutes, or until baked through.")).containsExactly("air-fryer");
    }

    @Test
    void bakingInTheAirFryerIsTheAirFryer() {
        assertThat(method("Place the muffins in the air fryer and bake at 160C for 12 minutes.")).containsExactly("air-fryer");
        assertThat(method("Microwave for 90 seconds, or until baked through.")).containsExactly("microwave");
        assertThat(method("Roast on the grill over indirect heat for an hour.")).containsExactly("grill");
    }

    @Test
    void theRealInstagramCaptionWithAnAirFryerAlternative() {
        // RecipeImportServiceTest.readsACaptionPaddedWithBulletsAndPaidFor: what the import makes of
        // it is what gets saved — the name and the method, no description.
        GeneratedRecipe draft = new RecipeImportService().fromCaption("""
                This oven baked chicken parm is one of my favorite weeknight dinners! Full list of ingredients below with info on how to air fry too 😊
                •
                •
                2 chicken breast
                ½ tsp paprika
                ½ cup grated parmesan (1/3 cup for bread crumbs rest for topping)
                Mozzarella
                Your favorite red sauce!

                Tip: Use @mccormickspice for the best flavor and quality! On rollback now at Walmart♥️

                BAKE 425 FOR 15 MINUTES THEN AGAIN FOR 5 MIN. BROIL ON HIGH FOR 2
                •
                •
                """, "u");

        assertThat(ApplianceDetector.detect(draft.name(), draft.description(), draft.instructions()))
                .containsExactly("oven", "air-fryer");
        // And the method on its own, should the phone rename the dish from the steps.
        assertThat(ApplianceDetector.detect("Chicken parm", null, draft.instructions())).containsExactly("oven");
    }

    // --- The outdoor grill ---

    @Test
    void theGrillIsOnlyTheOneOutside() {
        assertThat(method("Fire up the barbecue and cook the burgers for 4 minutes a side.")).containsExactly("grill");
        assertThat(method("Cook on the grill until charred.")).containsExactly("grill");
        assertThat(method("Oil the grill grates well.")).containsExactly("grill");
        assertThat(method("Light the charcoal and wait for it to ash over.")).containsExactly("grill");
        assertThat(method("Preheat the grill to medium-high.")).containsExactly("grill");
        assertThat(method("BBQ the corn until blackened in spots.")).containsExactly("grill");
    }

    @Test
    void aGrillPanBbqSauceAndAGrilledCheeseAreNot() {
        assertThat(method("Heat a grill pan over high heat and sear the steak.")).isEmpty();
        assertThat(method("Brush with BBQ sauce and serve.")).isEmpty();
        assertThat(method("Make a grilled cheese in a pan.")).isEmpty();
        // A bare "grill" is the oven's in Britain and the barbecue in America: it says nothing.
        assertThat(method("Grill the chicken for 6 minutes each side.")).isEmpty();
    }

    // --- The others ---

    @Test
    void theSlowCookerButNotSlowRoasting() {
        assertThat(method("Cover and cook on low for 6-8 hours.")).containsExactly("slow-cooker");
        assertThat(method("Tip into the crock pot.")).containsExactly("slow-cooker");
        assertThat(method("Slow-cook overnight.")).containsExactly("slow-cooker");
        assertThat(ApplianceDetector.detect("Slow-roasted tomatoes", null, "Roast at 120C for 3 hours."))
                .containsExactly("oven");
        // The hob's low is minutes.
        assertThat(method("Cook on low for 5 minutes, stirring.")).isEmpty();
    }

    @Test
    void theBlenderWhenItSaysSmooth() {
        assertThat(method("Blend until smooth.")).containsExactly("blender");
        assertThat(method("Blend everything on high until completely smooth.")).containsExactly("blender");
        assertThat(method("Liquidise the soup.")).containsExactly("blender");
        // Blending spices together is a spoon.
        assertThat(method("Blend the spices together in a bowl.")).isEmpty();
    }

    @Test
    void theMixerButNotTheTonic() {
        assertThat(method("Whisk the whites with an electric whisk until stiff.")).containsExactly("mixer");
        assertThat(method("Knead with the dough hook for 8 minutes.")).containsExactly("mixer");
        assertThat(method("Top up with your favourite mixer.")).isEmpty();
    }

    @Test
    void microwaveSafeIsStillTheMicrowave() {
        assertThat(method("Melt the chocolate in a microwave-safe bowl.")).containsExactly("microwave");
    }

    @Test
    void curlyApostrophesReadLikeStraightOnes() {
        assertThat(method("You don’t need a blender.")).isEmpty();
    }

    // --- Pasted text ---

    @Test
    void blanksPastedFromAPageReadLikeOneSpace() {
        assertThat(method("Cook at 200C   (180C\t fan)  for 20 minutes.")).containsExactly("oven");
        assertThat(method("Finish under  a hot grill.")).containsExactly("oven");
        // A blank line still ends a clause.
        assertThat(method("Air fry at 200C for 10 minutes\n\n   \n\nBake the bread for 30.")).containsExactly("oven", "air-fryer");
    }

    @Test
    void aLongRunOfBlanksAfterANumberIsReadInNoTime() {
        // "180C fan" once took hours to give up on a few thousand blanks after "Step 1" — on the
        // request saving the recipe, or on the start that reads every recipe again.
        method("Warm up.");
        for (String blank : new String[] {" ", "\n", "\t", " \n", "\r\n", " "}) {
            String steps = "Step 1" + blank.repeat(5000 / blank.length()) + "Mix everything.";
            assertTimeoutPreemptively(Duration.ofMillis(500), () -> assertThat(method(steps)).isEmpty());
            assertTimeoutPreemptively(Duration.ofMillis(500),
                    () -> assertThat(ApplianceDetector.detect("Soup 2" + blank.repeat(5000), steps, steps)).isEmpty());
        }
    }
}
