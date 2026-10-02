package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.mealplans.TargetPlanDtos.CalculateRequest;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.FormOptions;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.TargetsResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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

    static final List<String> FEATURES = List.of("cupboard", "use-by", "targets", "candidates");

    private final TargetPlans targetPlans;

    public MealPlansStatusController(TargetPlans targetPlans) {
        this.targetPlans = targetPlans;
    }

    @GetMapping
    public StatusResponse status() {
        return new StatusResponse(true, FEATURES);
    }

    /** What the create form offers: activity levels, goals, preference chips, plan lengths. */
    @GetMapping("/options")
    public FormOptions options() {
        return TargetPlans.formOptions();
    }

    /**
     * Daily targets from who a plan is for, for the create form's tiles as it is filled in.
     * Nothing is stored, so it needs no household.
     */
    @PostMapping("/targets/calculate")
    public TargetsResponse calculate(@Valid @RequestBody CalculateRequest request) {
        return targetPlans.calculate(request);
    }
}
