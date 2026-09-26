package com.gehan.mealplanner.security;

import com.gehan.mealplanner.service.AdminAccess;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.UrlPathHelper;

import java.io.IOException;
import java.util.Locale;

/**
 * Keeps /api/admin/** to the admin. Anyone else signed in gets exactly the 404 an address that
 * does not exist gets — same status, same body, whatever the method — so the admin pages are not
 * something a curious member can find by poking at the API.
 *
 * A filter, not a check in the controller alone, because by the time a controller method runs
 * Spring has already told the caller something: a POST to a GET-only address answers 405, and a
 * 405 says the address is real. Runs after sign-in has been checked, so a signed-out request
 * still gets the 401 every other signed-out request gets.
 *
 * Not a @Component on purpose: Spring Boot would also register it as a plain servlet filter,
 * outside the security chain, where nobody is signed in yet.
 */
public class AdminGate extends OncePerRequestFilter {

    private final AdminAccess adminAccess;

    public AdminGate(AdminAccess adminAccess) {
        this.adminAccess = adminAccess;
    }

    /**
     * Matched on the path the way Spring MVC will route it — percent-decoded, `;` parameters
     * dropped — not the raw one, or /api/%61dmin/overview would slip past here and reach the
     * controller, whose different answers would give the address away. Case is ignored as well,
     * which costs nothing: no other address starts that way.
     */
    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        String path = UrlPathHelper.defaultInstance.getPathWithinApplication(request).toLowerCase(Locale.ROOT);
        return !(path.equals("/api/admin") || path.startsWith("/api/admin/"));
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        if (!adminAccess.isAdmin(SecurityContextHolder.getContext().getAuthentication())) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        chain.doFilter(request, response);
    }
}
