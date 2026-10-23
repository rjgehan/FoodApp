package com.gehan.mealplanner.service;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The machine catalogue: the keys both apps mirror, in the order every list shows them, and what
 * the server will and will not store.
 */
class KitchenMachinesTest {

    @Test
    void theCatalogueInItsOrder() {
        assertThat(KitchenMachines.KEYS).containsExactly("oven", "stovetop", "microwave", "air-fryer", "slow-cooker",
                "pressure-cooker", "grill", "blender", "food-processor", "mixer", "rice-cooker");
        assertThat(KitchenMachines.ALL).extracting(KitchenMachines.Machine::label).containsExactly("Oven", "Stovetop",
                "Microwave", "Air fryer", "Slow cooker", "Instant Pot / pressure cooker", "Grill / BBQ", "Blender",
                "Food processor", "Stand or hand mixer", "Rice cooker");
    }

    @Test
    void keysAreTidiedAndCheckedBeforeTheyAreStored() {
        assertThat(KitchenMachines.requireKnown(Arrays.asList(" oven", "blender", "oven", "", null)))
                .containsExactly("oven", "blender");
        assertThat(KitchenMachines.requireKnown(null)).isEmpty();
        assertThatThrownBy(() -> KitchenMachines.requireKnown(List.of("oven", "toaster")))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode().value()).isEqualTo(400);
                    assertThat(e.getReason()).isEqualTo("There's no machine called toaster.");
                });
    }

    @Test
    void anyListComesBackInTheCataloguesOrderWithStrangersLeftOut() {
        assertThat(KitchenMachines.inOrder(List.of("rice-cooker", "oven", "toaster", "blender")))
                .containsExactly("oven", "blender", "rice-cooker");
        assertThat(KitchenMachines.inOrder(null)).isEmpty();
    }

    @Test
    void aKitchenLacksWhatARecipeNeedsAndItDoesNotHave() {
        List<String> kitchen = List.of("oven", "stovetop", "microwave");

        assertThat(KitchenMachines.missing(List.of("oven"), kitchen)).isEmpty();
        assertThat(KitchenMachines.missing(List.of(), kitchen)).isEmpty();
        assertThat(KitchenMachines.missing(null, kitchen)).isEmpty();
        // In the catalogue's order, whatever order the recipe has them in.
        assertThat(KitchenMachines.missing(List.of("rice-cooker", "oven", "slow-cooker"), kitchen))
                .containsExactly("slow-cooker", "rice-cooker");
        assertThat(KitchenMachines.canMake(List.of("oven", "microwave"), kitchen)).isTrue();
        assertThat(KitchenMachines.canMake(List.of("oven", "mixer"), kitchen)).isFalse();
    }

    @Test
    void aKitchenNobodyHasDescribedLacksNothing() {
        assertThat(KitchenMachines.missing(List.of("slow-cooker", "blender"), List.of())).isEmpty();
        assertThat(KitchenMachines.missing(List.of("slow-cooker"), null)).isEmpty();
    }

    @Test
    void theStovetopIsInEveryKitchenTickedOrNot() {
        List<String> noHob = List.of("microwave", "air-fryer");

        assertThat(KitchenMachines.missing(List.of("stovetop"), noHob)).isEmpty();
        assertThat(KitchenMachines.missing(List.of("stovetop", "air-fryer"), noHob)).isEmpty();
        assertThat(KitchenMachines.missing(List.of("stovetop", "oven"), noHob)).containsExactly("oven");
    }

    @Test
    void twoMachinesThatDoTheSameJobAreEitherOr() {
        assertThat(KitchenMachines.STAND_INS).containsExactly(List.of("oven", "air-fryer"),
                List.of("slow-cooker", "pressure-cooker"), List.of("blender", "food-processor"));

        // "Bake, or air fry at 180C": either kitchen can make it.
        assertThat(KitchenMachines.missing(List.of("oven", "air-fryer"), List.of("air-fryer"))).isEmpty();
        assertThat(KitchenMachines.missing(List.of("oven", "air-fryer"), List.of("oven"))).isEmpty();
        assertThat(KitchenMachines.missing(List.of("slow-cooker", "pressure-cooker"), List.of("pressure-cooker"))).isEmpty();
        assertThat(KitchenMachines.missing(List.of("blender", "food-processor"), List.of("food-processor"))).isEmpty();
        // Having neither, the kitchen lacks both that were named.
        assertThat(KitchenMachines.missing(List.of("oven", "air-fryer"), List.of("microwave")))
                .containsExactly("oven", "air-fryer");
        // The rest of what it needs is still needed.
        assertThat(KitchenMachines.missing(List.of("oven", "air-fryer", "mixer"), List.of("air-fryer")))
                .containsExactly("mixer");
    }

    @Test
    void aMachineNamedAloneIsNeededEvenWhenItsStandInIsThere() {
        // A smoothie is the blender's; a cake is the oven's.
        assertThat(KitchenMachines.missing(List.of("blender"), List.of("food-processor"))).containsExactly("blender");
        assertThat(KitchenMachines.missing(List.of("oven"), List.of("air-fryer"))).containsExactly("oven");
        assertThat(KitchenMachines.missing(List.of("slow-cooker"), List.of("pressure-cooker"))).containsExactly("slow-cooker");
        // Nor do machines of different families stand in for each other.
        assertThat(KitchenMachines.missing(List.of("oven", "blender"), List.of("air-fryer"))).containsExactly("oven", "blender");
    }
}
