package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.HouseholdMember;
import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.AuthDtos.AuthResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.AuthDtos.HouseholdSummary;
import com.gehan.mealplanner.dto.AuthDtos.LandingResponse;
import com.gehan.mealplanner.dto.AuthDtos.LoginRequest;
import com.gehan.mealplanner.dto.AuthDtos.SetPinRequest;
import com.gehan.mealplanner.dto.AuthDtos.SetupRequest;
import com.gehan.mealplanner.dto.AuthDtos.UserSummary;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.UserRepository;
import com.gehan.mealplanner.security.JwtService;
import com.gehan.mealplanner.security.PinAttemptLimiter;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final HouseholdRepository householdRepository;
    private final HouseholdMemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final PinAttemptLimiter attemptLimiter;
    private final HouseholdService householdService;

    public AuthService(UserRepository userRepository,
                       HouseholdRepository householdRepository,
                       HouseholdMemberRepository memberRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService,
                       PinAttemptLimiter attemptLimiter,
                       HouseholdService householdService) {
        this.userRepository = userRepository;
        this.householdRepository = householdRepository;
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.attemptLimiter = attemptLimiter;
        this.householdService = householdService;
    }

    /**
     * The first thing the login screen asks for. Everyone who can reach this app is already
     * trusted, so the household roster is public — it is what people tap to find themselves.
     */
    @Transactional(readOnly = true)
    public LandingResponse landing() {
        if (userRepository.count() == 0) {
            return new LandingResponse(true, List.of(), List.of());
        }
        List<HouseholdSummary> households = householdRepository.findAll().stream()
                .map(h -> new HouseholdSummary(h.getId(), h.getName(),
                        (int) memberRepository.countByHouseholdId(h.getId())))
                .sorted(Comparator.comparing(HouseholdSummary::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
        // Somebody has to be able to sign in as them, and the whole design is tap-your-name.
        List<UserSummary> unassigned = userRepository.findAll().stream()
                .filter(u -> memberRepository.findByUserId(u.getId()).isEmpty())
                .map(this::toSummary)
                .sorted(Comparator.comparing(UserSummary::displayName, String.CASE_INSENSITIVE_ORDER))
                .toList();
        return new LandingResponse(false, households, unassigned);
    }

    @Transactional(readOnly = true)
    public List<UserSummary> listHouseholdUsers(UUID householdId) {
        if (!householdRepository.existsById(householdId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such household");
        }
        return memberRepository.findByHouseholdId(householdId).stream()
                .map(m -> toSummary(m.getUser()))
                .sorted(Comparator.comparing(UserSummary::displayName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    /** Backs the "sign in with a username instead" escape hatch, for people in no household yet. */
    @Transactional(readOnly = true)
    public UserSummary findUser(String username) {
        return userRepository.findByUsername(username.trim())
                .map(this::toSummary)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No account with that name"));
    }

    public AuthResponse login(LoginRequest request) {
        String username = request.username().trim();

        long lockedFor = attemptLimiter.secondsUntilUnlocked(username);
        if (lockedFor > 0) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many incorrect PINs. Try again in " + Math.max(lockedFor / 60, 1) + " min.");
        }

        User user = userRepository.findByUsername(username).orElse(null);
        if (user != null && user.getPinHash() == null) {
            // The UI normally routes these to the set-a-PIN flow; this covers a stale page.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This account still needs a PIN");
        }
        if (user == null || !passwordEncoder.matches(request.pin(), user.getPinHash())) {
            attemptLimiter.recordFailure(username);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect username or PIN");
        }

        attemptLimiter.recordSuccess(username);
        return toAuthResponse(user);
    }

    /**
     * Claims a freshly-created account by choosing its PIN. Only works while the account has no
     * PIN, so it cannot be used to take over an account that is already in use.
     */
    @Transactional
    public AuthResponse setInitialPin(SetPinRequest request) {
        User user = userRepository.findByUsername(request.username().trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No account with that name"));
        if (user.getPinHash() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This account already has a PIN");
        }
        user.setPinHash(passwordEncoder.encode(request.pin()));
        return toAuthResponse(userRepository.save(user));
    }

    /** Creates the very first household and the account that owns it. Refused once anyone exists. */
    @Transactional
    public AuthResponse setup(SetupRequest request) {
        if (userRepository.count() > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This app is already set up — ask someone to make you an account.");
        }
        String username = request.username().trim();
        User owner = userRepository.save(User.builder()
                .username(username)
                .pinHash(passwordEncoder.encode(request.pin()))
                .displayName(displayNameOr(request.displayName(), username))
                .build());

        // Through HouseholdService so the first household gets the same default sub-categories
        // as every household made later.
        householdService.create(owner.getId(), new CreateHouseholdRequest(request.householdName().trim()));

        return toAuthResponse(owner);
    }

    public static String displayNameOr(String displayName, String fallback) {
        return displayName == null || displayName.isBlank() ? fallback : displayName.trim();
    }

    private UserSummary toSummary(User user) {
        return new UserSummary(user.getUsername(), user.getDisplayName(), user.getPinHash() != null);
    }

    private AuthResponse toAuthResponse(User user) {
        return new AuthResponse(jwtService.generateToken(user.getId(), user.getUsername()),
                user.getId(), user.getDisplayName());
    }
}
