package com.gehan.mealplanner.integration;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

/** Guards /api/integration/** with a single shared key. Nothing else in the app uses it. */
@Component
public class IntegrationAuthFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-API-Key";
    private static final String PREFIX = "/api/integration/";

    private final IntegrationProperties properties;

    public IntegrationAuthFilter(IntegrationProperties properties) {
        this.properties = properties;
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        return !request.getRequestURI().startsWith(PREFIX);
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {

        if (!properties.enabled()) {
            send(response, HttpStatus.SERVICE_UNAVAILABLE,
                    "The integration API is off. Set INTEGRATION_API_KEY to turn it on.");
            return;
        }

        String presented = request.getHeader(HEADER);
        if (presented == null || !constantTimeEquals(presented, properties.apiKey())) {
            send(response, HttpStatus.UNAUTHORIZED, "Missing or wrong " + HEADER + ".");
            return;
        }

        // A principal that is deliberately not a UUID: no user is behind these calls, and the
        // rest of the app reads @AuthenticationPrincipal UUID, so this can never be mistaken
        // for a signed-in person.
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("integration", null, List.of()));
        filterChain.doFilter(request, response);
    }

    /** Length-independent compare, so a wrong key cannot be narrowed down by timing. */
    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    private static void send(HttpServletResponse response, HttpStatus status, String message) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"status\":%d,\"message\":\"%s\"}".formatted(status.value(), message));
    }
}
