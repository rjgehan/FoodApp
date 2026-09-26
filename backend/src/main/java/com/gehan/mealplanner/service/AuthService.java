package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.HouseholdMember;
import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.AuthDtos.AuthResponse;
import com.gehan.mealplanner.dto.AuthDtos.EmailLoginRequest;
import com.gehan.mealplanner.dto.AuthDtos.UsePasswordResetRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.AuthDtos.HouseholdSummary;
import com.gehan.mealplanner.dto.AuthDtos.LandingResponse;
import com.gehan.mealplanner.dto.AuthDtos.LoginRequest;
import com.gehan.mealplanner.dto.AuthDtos.SetPinRequest;
import com.gehan.mealplanner.dto.AuthDtos.SetupRequest;
import com.gehan.mealplanner.dto.AuthDtos.SignupRequest;
import com.gehan.mealplanner.dto.AuthDtos.UserSummary;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.UserRepository;
import com.gehan.mealplanner.security.JwtService;
import com.gehan.mealplanner.security.SignInAttemptLimiter;
import org.springframework.beans.factory.annotation.Value;
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
    private final SignInAttemptLimiter attemptLimiter;
    private final HouseholdService householdService;
    private final AccountService accountService;
    private final InviteService inviteService;
    /**
     * The name-and-PIN screens. On while people are still moving to email sign-in; the owner
     * turns it off (LEGACY_PIN_LOGIN=false) once every member list shows an email for everyone.
     */
    private final boolean legacyPinLogin;

    public AuthService(UserRepository userRepository,
                       HouseholdRepository householdRepository,
                       HouseholdMemberRepository memberRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService,
                       SignInAttemptLimiter attemptLimiter,
                       HouseholdService householdService,
                       AccountService accountService,
                       InviteService inviteService,
                       @Value("${app.auth.legacy-pin-login:true}") boolean legacyPinLogin) {
        this.userRepository = userRepository;
        this.householdRepository = householdRepository;
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.attemptLimiter = attemptLimiter;
        this.householdService = householdService;
        this.accountService = accountService;
        this.inviteService = inviteService;
        this.legacyPinLogin = legacyPinLogin;
    }

    public boolean legacyPinLogin() {
        return legacyPinLogin;
    }

    /**
     * 410 rather than 404: the endpoint is known and was real, it has just been retired. An old
     * app that still draws the PIN pad gets a sentence saying what to do instead.
     */
    private void requireLegacyPinLogin() {
        if (!legacyPinLogin) {
            throw new ResponseStatusException(HttpStatus.GONE,
                    "Signing in with a name and PIN has been switched off. Use your email and password.");
        }
    }

    /**
     * The first thing the login screen asks for. Everyone who can reach this app is already
     * trusted, so the household roster is public — it is what people tap to find themselves.
     */
    @Transactional(readOnly = true)
    public LandingResponse landing() {
        if (userRepository.count() == 0) {
            return new LandingResponse(true, List.of(), List.of(), legacyPinLogin);
        }
        // With the PIN screens off, the roster has nobody to serve — so it is not handed out.
        if (!legacyPinLogin) {
            return new LandingResponse(false, List.of(), List.of(), false);
        }
        List<HouseholdSummary> households = householdRepository.findAll().stream()
                .map(h -> new HouseholdSummary(h.getId(), h.getName(),
                        (int) memberRepository.countByHouseholdId(h.getId())))
                .sorted(Comparator.comparing(HouseholdSummary::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
        // Somebody has to be able to sign in as them, and the whole design is tap-your-name.
        List<UserSummary> unassigned = userRepository.findAll().stream()
                .filter(AuthService::onPinRoster)
                .filter(u -> memberRepository.findByUserId(u.getId()).isEmpty())
                .map(this::toSummary)
                .sorted(Comparator.comparing(UserSummary::displayName, String.CASE_INSENSITIVE_ORDER))
                .toList();
        return new LandingResponse(false, households, unassigned, true);
    }

    @Transactional(readOnly = true)
    public List<UserSummary> listHouseholdUsers(UUID householdId) {
        requireLegacyPinLogin();
        if (!householdRepository.existsById(householdId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such household");
        }
        return memberRepository.findByHouseholdId(householdId).stream()
                .map(HouseholdMember::getUser)
                .filter(AuthService::onPinRoster)
                .map(this::toSummary)
                .sorted(Comparator.comparing(UserSummary::displayName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    /** Backs the "sign in with a username instead" escape hatch, for people in no household yet. */
    @Transactional(readOnly = true)
    public UserSummary findUser(String username) {
        requireLegacyPinLogin();
        return userRepository.findForSignIn(username)
                .map(this::toSummary)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No account with that name"));
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        requireLegacyPinLogin();
        String username = request.username().trim();
        // One counter per account, however it is capitalised — otherwise "Ryan", "RYAN" and
        // "ryan" would each get their own five tries.
        String limiterKey = "pin:" + username.toLowerCase(java.util.Locale.ROOT);

        long lockedFor = attemptLimiter.secondsUntilUnlocked(limiterKey);
        if (lockedFor > 0) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many incorrect PINs. " + SignInAttemptLimiter.tryAgainIn(lockedFor));
        }

        User user = userRepository.findForSignIn(username).orElse(null);
        if (user != null && user.getPinHash() == null) {
            if (hasOtherSignIn(user)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "This account signs in with an email and password.");
            }
            // The UI normally routes these to the set-a-PIN flow; this covers a stale page.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This account still needs a PIN");
        }
        if (user == null || !passwordEncoder.matches(request.pin(), user.getPinHash())) {
            attemptLimiter.recordFailure(limiterKey);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect username or PIN");
        }

        attemptLimiter.recordSuccess(limiterKey);
        rememberPickedHousehold(user, request.householdId());
        return toAuthResponse(user);
    }

    /**
     * Email and password: the sign-in everyone is moving to. One counter per address, and the
     * same answer — in the same time, since an unknown address still costs a BCrypt compare —
     * for an unknown address as for a wrong password, so this cannot be used to find out who
     * has an account.
     */
    @Transactional(readOnly = true)
    public AuthResponse loginWithEmail(EmailLoginRequest request) {
        String email = AccountService.normaliseEmail(request.email());
        String limiterKey = "email:" + email;

        long lockedFor = attemptLimiter.secondsUntilUnlocked(limiterKey);
        if (lockedFor > 0) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many incorrect passwords. " + SignInAttemptLimiter.tryAgainIn(lockedFor));
        }

        User user = userRepository.findByEmail(email).orElse(null);
        if (!accountService.passwordMatches(request.password(), user == null ? null : user.getPasswordHash())) {
            attemptLimiter.recordFailure(limiterKey);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect email or password");
        }

        attemptLimiter.recordSuccess(limiterKey);
        return toAuthResponse(user);
    }

    /** A forgotten password, set again through the link an owner handed over. Signs them in. */
    public AuthResponse usePasswordReset(UsePasswordResetRequest request) {
        return toAuthResponse(accountService.useReset(request.token(), request.password(), request.email()));
    }

    /** Somebody new, through an invite link. Signs them straight in, in the house that asked. */
    public AuthResponse signUp(SignupRequest request) {
        return toAuthResponse(inviteService.signUp(request));
    }

    /**
     * On the name-and-PIN screens you get to your name by tapping a house, and that is the house
     * you meant — so it becomes the one you are remembered in, and the answer below reports it.
     */
    private void rememberPickedHousehold(User user, UUID householdId) {
        if (householdId != null && memberRepository.existsByHouseholdIdAndUserId(householdId, user.getId())) {
            user.setLastHouseholdId(householdId);
            userRepository.save(user);
        }
    }

    /**
     * Claims a freshly-created account by choosing its PIN. Only works while the account has no
     * way in at all — no PIN, and no email or password either — so it cannot be used to take
     * over an account that is already in use. An owner made at first-run setup, or somebody who
     * came in through a reset link, has a password and no PIN; without the second check anyone
     * could give them one.
     */
    @Transactional
    public AuthResponse setInitialPin(SetPinRequest request) {
        requireLegacyPinLogin();
        User user = userRepository.findForSignIn(request.username())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No account with that name"));
        if (user.getPinHash() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This account already has a PIN");
        }
        if (hasOtherSignIn(user)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This account signs in with an email and password.");
        }
        user.setPinHash(passwordEncoder.encode(request.pin()));
        rememberPickedHousehold(user, request.householdId());
        return toAuthResponse(userRepository.save(user));
    }

    /**
     * A fresh token for someone already signed in. Looked up rather than trusted, because the
     * account may have gone since — and it picks up a rename made on another device.
     */
    @Transactional(readOnly = true)
    public AuthResponse refresh(UUID userId) {
        return userRepository.findById(userId)
                .map(this::toAuthResponse)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Signed out"));
    }

    /**
     * Creates the very first household and the account that owns it. Refused once anyone exists.
     *
     * Today's form asks for a name, an email and a password; the older shape — a username and a
     * PIN — still works, for scripts and while the PIN screens are on. Some way to sign in again
     * has to come with it, or the only account on the server is one nobody can get back into.
     */
    @Transactional
    public AuthResponse setup(SetupRequest request) {
        if (userRepository.count() > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This app is already set up — ask someone in your household for an invite link.");
        }
        boolean withEmail = request.email() != null && !request.email().isBlank();
        boolean withPin = request.pin() != null && !request.pin().isBlank();
        if (!withEmail && !(withPin && legacyPinLogin)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Add an email and a password.");
        }
        if (withPin && (request.username() == null || request.username().isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A PIN needs a username to go with it.");
        }
        if (withEmail) {
            AccountService.checkPassword(request.password());
        }

        String username = request.username() != null && !request.username().isBlank()
                ? request.username().trim()
                : accountService.usernameFromEmail(request.email());
        User owner = User.builder()
                .username(username)
                .pinHash(withPin ? passwordEncoder.encode(request.pin()) : null)
                .displayName(displayNameOr(request.displayName(), username))
                .build();
        if (withEmail) {
            accountService.claimEmail(owner, request.email());
            owner.setPasswordHash(accountService.encodePassword(request.password()));
        }
        owner = accountService.saveClaimingEmail(owner);

        // Through HouseholdService so the first household gets the same default sub-categories
        // as every household made later.
        UUID householdId = householdService.create(owner.getId(),
                new CreateHouseholdRequest(request.householdName().trim())).id();
        owner.setLastHouseholdId(householdId);

        return toAuthResponse(userRepository.save(owner));
    }

    public static String displayNameOr(String displayName, String fallback) {
        return displayName == null || displayName.isBlank() ? fallback : displayName.trim();
    }

    /** An email or a password means somebody already owns this account, PIN or no PIN. */
    private static boolean hasOtherSignIn(User user) {
        return user.getPasswordHash() != null || user.getEmail() != null;
    }

    /**
     * Whether the tap-your-name screens list this account. Not one that only ever had an email
     * and password — somebody who signed up through an invite, say. The keypad has nothing to
     * offer them, and their username is made from their email, so listing it on a page anybody
     * can open would hand out half of the address they sign in with.
     */
    private static boolean onPinRoster(User user) {
        return user.getPinHash() != null || !hasOtherSignIn(user);
    }

    /**
     * pinSet=false is what sends a tap on the name to "choose your PIN", so it is only reported
     * for an account nobody has claimed yet. Someone with an email and password but no PIN gets
     * the PIN pad, and the PIN sign-in tells them to use their email instead.
     */
    private UserSummary toSummary(User user) {
        return new UserSummary(user.getUsername(), user.getDisplayName(),
                user.getPinHash() != null || hasOtherSignIn(user));
    }

    private AuthResponse toAuthResponse(User user) {
        return new AuthResponse(jwtService.generateToken(user.getId(), user.getUsername()),
                user.getId(), user.getDisplayName(), accountService.lastHouseholdOf(user));
    }
}
