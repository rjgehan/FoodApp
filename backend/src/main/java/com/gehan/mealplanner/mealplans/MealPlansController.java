package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.mealplans.CupboardPlanDtos.ApplyRequest;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.ApplyResponse;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.CupboardPlanRequest;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.CupboardPlanResponse;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.CupboardSetupResponse;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.CupboardSwapRequest;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.ApplyTargetPlanRequest;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.CreateTargetPlanRequest;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.MealPlansHome;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.PreviewRequest;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.PreviewSwapRequest;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.SwapRequest;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.TargetPlanCard;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.TargetPlanResponse;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.UpdateTargetPlanRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Meal plans (Explore, mockup 5.7–5.11): one generated from what is in the cupboard, plans for
 * health targets (ready-made, previews, and your own private ones), and putting any generated
 * meals on the household's Plan. Members of the household only, like its Plan; your own target
 * plans are yours alone, and anybody else gets 404 for them.
 */
@RestController
@RequestMapping("/api/households/{householdId}/meal-plans")
public class MealPlansController {

    private final CupboardPlans cupboardPlans;
    private final PlanApply apply;
    private final TargetPlans targetPlans;

    public MealPlansController(CupboardPlans cupboardPlans, PlanApply apply, TargetPlans targetPlans) {
        this.cupboardPlans = cupboardPlans;
        this.apply = apply;
        this.targetPlans = targetPlans;
    }

    /** The Meal plans page in one go: the cupboard teaser, filters, and plan cards (yours first). */
    @GetMapping
    public MealPlansHome home(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return targetPlans.home(householdId, userId);
    }

    /** What the cupboard setup starts from; also the teaser on Meal plans and Explore. */
    @GetMapping("/cupboard")
    public CupboardSetupResponse cupboardSetup(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return cupboardPlans.setup(householdId, userId);
    }

    /** A draft — nothing is saved until it is applied. */
    @PostMapping("/cupboard")
    public CupboardPlanResponse cupboardPlan(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                             @Valid @RequestBody CupboardPlanRequest request) {
        return cupboardPlans.generate(householdId, userId, request);
    }

    /** What a phone's Apple Intelligence may choose a draft (or one swap) from. Nothing is saved. */
    @PostMapping("/cupboard/candidates")
    public CupboardPlanDtos.CupboardCandidatesResponse cupboardCandidates(
            @AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
            @Valid @RequestBody CupboardPlanDtos.CupboardCandidatesRequest request) {
        return cupboardPlans.candidates(householdId, userId, request);
    }

    @PostMapping("/cupboard/swap")
    public CupboardPlanResponse cupboardSwap(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                             @Valid @RequestBody CupboardSwapRequest request) {
        return cupboardPlans.swap(householdId, userId, request);
    }

    /** Puts meals on the Plan (never over one already there) and, optionally, things on the grocery list. */
    @PostMapping("/apply")
    public ApplyResponse apply(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                               @Valid @RequestBody ApplyRequest request) {
        return apply.apply(householdId, userId, request.meals(), request.addToGroceries());
    }

    /** A ready-made plan, its meals chosen from this household's recipes (and published ones) now. */
    @GetMapping("/presets/{key}")
    public TargetPlanResponse preset(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                     @PathVariable String key) {
        return targetPlans.preset(householdId, userId, key);
    }

    /** What a plan from these details would be, without saving anything. */
    @PostMapping("/targets/preview")
    public TargetPlanResponse preview(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                      @Valid @RequestBody PreviewRequest request) {
        return targetPlans.preview(householdId, userId, request);
    }

    /** What a phone's Apple Intelligence may choose a plan for these details from. Nothing is saved. */
    @PostMapping("/targets/candidates")
    public TargetPlanDtos.TargetCandidatesResponse targetCandidates(
            @AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
            @Valid @RequestBody TargetPlanDtos.CandidatesRequest request) {
        return targetPlans.candidates(householdId, userId, request.details());
    }

    @PostMapping("/targets/preview/swap")
    public TargetPlanResponse previewSwap(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                          @Valid @RequestBody PreviewSwapRequest request) {
        return targetPlans.previewSwap(householdId, userId, request);
    }

    /** Your own plans in this household. Nobody else's are ever listed. */
    @GetMapping("/targets")
    public List<TargetPlanCard> mine(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return targetPlans.mine(householdId, userId);
    }

    @PostMapping("/targets")
    public ResponseEntity<TargetPlanResponse> create(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                                     @Valid @RequestBody CreateTargetPlanRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(targetPlans.create(householdId, userId, request));
    }

    @GetMapping("/targets/{planId}")
    public TargetPlanResponse get(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                  @PathVariable UUID planId) {
        return targetPlans.get(householdId, userId, planId);
    }

    @PutMapping("/targets/{planId}")
    public TargetPlanResponse update(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                     @PathVariable UUID planId, @Valid @RequestBody UpdateTargetPlanRequest request) {
        return targetPlans.update(householdId, userId, planId, request);
    }

    @DeleteMapping("/targets/{planId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                       @PathVariable UUID planId) {
        targetPlans.delete(householdId, userId, planId);
        return ResponseEntity.noContent().build();
    }

    /** Choose every meal again from the same details. */
    @PostMapping("/targets/{planId}/regenerate")
    public TargetPlanResponse regenerate(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                         @PathVariable UUID planId) {
        return targetPlans.regenerate(householdId, userId, planId);
    }

    @PostMapping("/targets/{planId}/swap")
    public TargetPlanResponse swap(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                   @PathVariable UUID planId, @Valid @RequestBody SwapRequest request) {
        return targetPlans.swap(householdId, userId, planId, request);
    }

    /** Your plan's meals onto the household's Plan from a start date; the plan itself stays private. */
    @PostMapping("/targets/{planId}/apply")
    public CupboardPlanDtos.ApplyResponse applyPlan(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                                    @PathVariable UUID planId,
                                                    @Valid @RequestBody ApplyTargetPlanRequest request) {
        return targetPlans.apply(householdId, userId, planId, request);
    }
}
