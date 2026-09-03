package com.gehan.mealplanner.security;

import com.gehan.mealplanner.integration.IntegrationAuthFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final IntegrationAuthFilter integrationAuthFilter;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter, IntegrationAuthFilter integrationAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
        this.integrationAuthFilter = integrationAuthFilter;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/api/auth/**", "/ws/**", "/actuator/health", "/error").permitAll()
                        // Image bytes only: an <img> tag cannot carry a bearer token, and the
                        // random UUID in the path is what keeps the URL unguessable.
                        .requestMatchers(HttpMethod.GET, "/api/images/**").permitAll()
                        // A share link opens this with no account. The 256-bit token in the URL
                        // is the credential, and the response carries only the recipe itself.
                        .requestMatchers(HttpMethod.GET, "/api/public/**").permitAll()
                        .anyRequest().authenticated())
                // Runs before the JWT filter: /api/integration/** authenticates with a shared
                // key and no user, and the filter answers 401/503 itself rather than falling
                // through to a login the caller has no way to complete.
                .addFilterBefore(integrationAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /** Wide open for local dev only — the test frontend runs on a different origin/port than the API. */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of("*"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        // SockJS's XHR-polling transport (used to negotiate before opening the actual WebSocket)
        // sends credentialed requests by default. With allowedOriginPatterns (not a literal "*"),
        // Spring reflects back the real request origin, so this is safe to combine with a wildcard.
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
