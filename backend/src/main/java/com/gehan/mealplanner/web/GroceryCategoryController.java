package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.GroceryCategoryDtos.CreateGroceryCategoryRequest;
import com.gehan.mealplanner.dto.GroceryCategoryDtos.GroceryCategoryResponse;
import com.gehan.mealplanner.dto.GroceryCategoryDtos.RenameGroceryCategoryRequest;
import com.gehan.mealplanner.dto.GroceryCategoryDtos.ReorderGroceryCategoriesRequest;
import com.gehan.mealplanner.service.GroceryCategoryService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/households/{householdId}/categories")
public class GroceryCategoryController {

    private final GroceryCategoryService categoryService;

    public GroceryCategoryController(GroceryCategoryService categoryService) {
        this.categoryService = categoryService;
    }

    @GetMapping
    public List<GroceryCategoryResponse> list(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return categoryService.list(householdId, userId);
    }

    @PostMapping
    public ResponseEntity<GroceryCategoryResponse> create(@AuthenticationPrincipal UUID userId,
                                                            @PathVariable UUID householdId,
                                                            @Valid @RequestBody CreateGroceryCategoryRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(categoryService.create(householdId, userId, request.name()));
    }

    @PatchMapping("/{categoryId}")
    public GroceryCategoryResponse rename(@AuthenticationPrincipal UUID userId,
                                           @PathVariable UUID householdId,
                                           @PathVariable UUID categoryId,
                                           @Valid @RequestBody RenameGroceryCategoryRequest request) {
        return categoryService.rename(householdId, categoryId, userId, request.name());
    }

    @PutMapping("/order")
    public List<GroceryCategoryResponse> reorder(@AuthenticationPrincipal UUID userId,
                                                  @PathVariable UUID householdId,
                                                  @Valid @RequestBody ReorderGroceryCategoriesRequest request) {
        return categoryService.reorder(householdId, userId, request.order());
    }

    @DeleteMapping("/{categoryId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UUID userId,
                                        @PathVariable UUID householdId,
                                        @PathVariable UUID categoryId) {
        categoryService.delete(householdId, categoryId, userId);
        return ResponseEntity.noContent().build();
    }
}
