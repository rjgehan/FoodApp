package com.gehan.mealplanner.web;

import com.gehan.mealplanner.service.KitchenMachines;
import com.gehan.mealplanner.service.KitchenMachines.Machine;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The machines the server will store, with their names, in the order the apps list them. The
 * apps carry their own copy (they need the drawings anyway), so this is for checking that copy
 * against, and for anything without one.
 */
@RestController
public class KitchenMachineController {

    @GetMapping("/api/kitchen-machines")
    public List<Machine> machines() {
        return KitchenMachines.ALL;
    }
}
