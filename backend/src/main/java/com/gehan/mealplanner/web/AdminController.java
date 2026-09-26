package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.AdminDtos.AdminPage;
import com.gehan.mealplanner.dto.AdminDtos.HouseholdDetail;
import com.gehan.mealplanner.dto.AdminDtos.HouseholdRow;
import com.gehan.mealplanner.dto.AdminDtos.Overview;
import com.gehan.mealplanner.dto.AdminDtos.RecipeDetail;
import com.gehan.mealplanner.dto.AdminDtos.RecipeRow;
import com.gehan.mealplanner.dto.AdminDtos.UserRow;
import com.gehan.mealplanner.service.AdminAccess;
import com.gehan.mealplanner.service.AdminService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.UUID;

/**
 * The owner's read-only view of the whole server: every household, every account, every recipe.
 *
 * AdminGate turns everyone else away before a request gets here, with the same 404 an address
 * that does not exist gets, so nobody learns there is anything here. Each method checks again
 * all the same: a path the gate somehow missed must still not open.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;
    private final AdminAccess adminAccess;

    public AdminController(AdminService adminService, AdminAccess adminAccess) {
        this.adminService = adminService;
        this.adminAccess = adminAccess;
    }

    @GetMapping("/overview")
    public Overview overview(Authentication auth) {
        requireAdmin(auth);
        return adminService.overview();
    }

    /** `sort` is name, created, members, recipes or owner; `dir` is asc or desc. */
    @GetMapping("/households")
    public AdminPage<HouseholdRow> households(Authentication auth,
                                              @RequestParam(required = false) String sort,
                                              @RequestParam(required = false) String dir,
                                              @RequestParam(required = false) Integer page,
                                              @RequestParam(required = false) Integer size) {
        requireAdmin(auth);
        return adminService.households(sort, dir, page, size);
    }

    @GetMapping("/households/{householdId}")
    public HouseholdDetail household(Authentication auth, @PathVariable UUID householdId) {
        requireAdmin(auth);
        return adminService.household(householdId);
    }

    @GetMapping("/users")
    public AdminPage<UserRow> users(Authentication auth,
                                    @RequestParam(required = false) String q,
                                    @RequestParam(required = false) Integer page,
                                    @RequestParam(required = false) Integer size) {
        requireAdmin(auth);
        return adminService.users(q, page, size);
    }

    @GetMapping("/recipes")
    public AdminPage<RecipeRow> recipes(Authentication auth,
                                        @RequestParam(required = false) String q,
                                        @RequestParam(required = false) UUID householdId,
                                        @RequestParam(required = false) Integer page,
                                        @RequestParam(required = false) Integer size) {
        requireAdmin(auth);
        return adminService.recipes(q, householdId, page, size);
    }

    @GetMapping("/recipes/{recipeId}")
    public RecipeDetail recipe(Authentication auth, @PathVariable UUID recipeId) {
        requireAdmin(auth);
        return adminService.recipe(recipeId);
    }

    private void requireAdmin(Authentication auth) {
        if (!adminAccess.isAdmin(auth)) {
            throw new NotAdmin();
        }
    }

    /** Only ever thrown here, and answered below. */
    private static class NotAdmin extends RuntimeException {
        NotAdmin() {
            super(null, null, false, false);
        }
    }

    /**
     * The same plain 404 AdminGate sends, through the same error page, rather than the
     * {status, message} body the app's own refusals have — that body would say "this is real".
     */
    @ExceptionHandler(NotAdmin.class)
    void notAdmin(HttpServletResponse response) throws IOException {
        response.sendError(HttpServletResponse.SC_NOT_FOUND);
    }
}
