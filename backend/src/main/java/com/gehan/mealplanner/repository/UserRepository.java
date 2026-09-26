package com.gehan.mealplanner.repository;

import com.gehan.mealplanner.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByUsername(String username);
    boolean existsByUsername(String username);

    List<User> findByUsernameIgnoreCase(String username);

    /** Emails are stored lowercased, so an exact match is the case-insensitive one. */
    Optional<User> findByEmail(String email);
    boolean existsByUsernameIgnoreCase(String username);

    /**
     * What someone typed to sign in. Phones capitalise the first letter of a text field, so
     * "Ryan" has to find "ryan". An exact match wins; otherwise a case-insensitive one, but only
     * when it is unambiguous — accounts made before names were compared this way could differ
     * only by case.
     */
    default Optional<User> findForSignIn(String typed) {
        String username = typed.trim();
        return findByUsername(username).or(() -> {
            List<User> matches = findByUsernameIgnoreCase(username);
            return matches.size() == 1 ? Optional.of(matches.get(0)) : Optional.empty();
        });
    }
}
