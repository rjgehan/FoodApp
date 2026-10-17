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
}
