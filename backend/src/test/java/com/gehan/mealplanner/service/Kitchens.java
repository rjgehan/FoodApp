package com.gehan.mealplanner.service;

import com.gehan.mealplanner.dto.HouseholdDtos.UpdateKitchenRequest;

import java.util.UUID;

/**
 * A household made today starts without a cupboard (HouseholdService.create). The tests about
 * the cupboard — what it keeps off the list, what Done shopping puts in it, what is running low —
 * turn it on first, as somebody would in the kitchen settings. The ones about going without it
 * turn it back off once there is something in it.
 */
final class Kitchens {

    private Kitchens() {
    }

    static void turnOnCupboard(HouseholdService households, UUID householdId, UUID memberId) {
        households.updateKitchen(householdId, memberId, new UpdateKitchenRequest(true, null, null, null));
    }

    /** As somebody would who used it once and gave up: the rows it had are still there, out of sight. */
    static void turnOffCupboard(HouseholdService households, UUID householdId, UUID memberId) {
        households.updateKitchen(householdId, memberId, new UpdateKitchenRequest(false, null, null, null));
    }
}
