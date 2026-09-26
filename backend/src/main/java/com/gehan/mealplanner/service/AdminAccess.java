package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.repository.UserRepository;
import com.gehan.mealplanner.security.JwtService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Who may open the admin pages: the server's owner, named in config (ADMIN_EMAILS and
 * ADMIN_USERNAMES), never in the code. Both empty — the default — means nobody.
 *
 * An account needs its email on the one list AND its username on the other. The email alone is
 * not enough because addresses are typed in by whoever gets there first and never verified: a
 * stranger who put the owner's address on their account before the owner did would otherwise be
 * handed everybody's data. Usernames cannot be taken twice, and the owner's is already theirs.
 * For the same reason an address on the list can only be put on an account whose username is on
 * the other one, and a username on the list cannot be picked up by renaming or signing up.
 *
 * And the account has to have signed in with its password, not its PIN. The owner's account is
 * from the PIN days and keeps its PIN while those screens are on; four digits the rest of the
 * family may know, with a handful of guesses allowed every quarter of an hour, are fine for one
 * house and not for all of them.
 */
@Component
public class AdminAccess {

    public static final String EMAIL_RESERVED = "That email is reserved.";

    private final Set<String> emails;
    private final Set<String> usernames;
    private final UserRepository userRepository;

    public AdminAccess(@Value("${app.admin.emails:}") String emails,
                       @Value("${app.admin.usernames:}") String usernames,
                       UserRepository userRepository) {
        this.emails = listOf(emails);
        this.usernames = listOf(usernames);
        this.userRepository = userRepository;
    }

    /** Comma-separated, compared lowercased and trimmed, blanks ignored. */
    private static Set<String> listOf(String raw) {
        if (raw == null) {
            return Set.of();
        }
        return Arrays.stream(raw.split(","))
                .map(s -> s.trim().toLowerCase(Locale.ROOT))
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    public boolean isAdmin(User user) {
        return user != null && isAdminEmail(user.getEmail()) && isAdminUsername(user.getUsername());
    }

    /**
     * The check the admin pages make: this request's account is the admin, and its session began
     * with a password (see JwtService.PASSWORD_SESSION).
     */
    public boolean isAdmin(Authentication auth) {
        return auth != null && auth.getPrincipal() instanceof UUID userId
                && JwtService.signedInWithPassword(auth) && isAdmin(userId);
    }

    /** A token for an account that has since been deleted is simply not an admin. */
    public boolean isAdmin(UUID userId) {
        return userId != null && userRepository.findById(userId).map(this::isAdmin).orElse(false);
    }

    public boolean isAdminEmail(String email) {
        return email != null && emails.contains(email.trim().toLowerCase(Locale.ROOT));
    }

    public boolean isAdminUsername(String username) {
        return username != null && usernames.contains(username.trim().toLowerCase(Locale.ROOT));
    }
}
