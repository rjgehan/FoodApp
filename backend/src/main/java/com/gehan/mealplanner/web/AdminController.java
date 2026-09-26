package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.AdminDtos.AccountDeletion;
import com.gehan.mealplanner.dto.AdminDtos.AdminPage;
import com.gehan.mealplanner.dto.AdminDtos.HouseholdDetail;
import com.gehan.mealplanner.dto.AdminDtos.HouseholdRow;
import com.gehan.mealplanner.dto.AdminDtos.Overview;
import com.gehan.mealplanner.dto.AdminDtos.RecipeDetail;
import com.gehan.mealplanner.dto.AdminDtos.RecipeRow;
import com.gehan.mealplanner.dto.AdminDtos.UserRow;
import com.gehan.mealplanner.service.AdminAccess;
import com.gehan.mealplanner.service.AdminService;
import com.gehan.mealplanner.service.HouseholdService;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.UUID;

/**
 * The owner's view of the whole server: every household, every account, every recipe. Read-only,
 * except that an account nobody needs can be deleted.
 *
 * AdminGate turns everyone else away before a request gets here, with the same 404 an address
 * that does not exist gets, so nobody learns there is anything here. Each method checks again
 * all the same: a path the gate somehow missed must still not open.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private static final Logger log = LoggerFactory.getLogger(AdminController.class);

    private final AdminService adminService;
    private final AdminAccess adminAccess;
    private final HouseholdService householdService;

    public AdminController(AdminService adminService, AdminAccess adminAccess, HouseholdService householdService) {
        this.adminService = adminService;
        this.adminAccess = adminAccess;
        this.householdService = householdService;
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

    /** What deleting this account would do to each house it is in — shown before asking. */
    @GetMapping("/users/{userId}/deletion-preview")
    public AccountDeletion deletionPreview(Authentication auth, @PathVariable UUID userId) {
        requireAdmin(auth);
        refuseSelf(auth, userId);
        return householdService.accountDeletionPreview(userId);
    }

    @DeleteMapping("/users/{userId}")
    public AccountDeletion deleteUser(Authentication auth, @PathVariable UUID userId) {
        requireAdmin(auth);
        refuseSelf(auth, userId);
        AccountDeletion done = householdService.deleteAccount(userId);
        log.info("Admin {} deleted account {} ({}): {}", auth.getPrincipal(), userId, done.displayName(),
                done.households().stream().map(h -> h.name() + " " + h.outcome()).toList());
        return done;
    }

    /** The admin's own account holds the keys to this page; losing it by a slip is not a tidy-up. */
    private static void refuseSelf(Authentication auth, UUID userId) {
        if (userId.equals(auth.getPrincipal())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You can't delete your own account here.");
        }
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
