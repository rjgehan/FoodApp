package com.gehan.mealplanner.mealplans;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * GET /api/meal-plans answers on any server that has meal plans, so an app can tell whether to
 * open its Meal plans door at all: an older server answers 404 and the door stays "coming soon".
 */
@RestController
@RequestMapping("/api/meal-plans")
public class MealPlansStatusController {

    public record StatusResponse(boolean ready, List<String> features) {
    }

    static final List<String> FEATURES = List.of("cupboard", "use-by");

    @GetMapping
    public StatusResponse status() {
        return new StatusResponse(true, FEATURES);
    }
}
