package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.HouseholdMember;
import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.PasswordReset;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.AuthDtos;
import com.gehan.mealplanner.dto.AuthDtos.PasswordResetInfo;
import com.gehan.mealplanner.dto.AuthDtos.PasswordResetLinkResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.CredentialsRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.MeResponse;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.PasswordResetRepository;
import com.gehan.mealplanner.repository.UserRepository;
import com.gehan.mealplanner.security.SignInAttemptLimiter;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * How a person signs in, as opposed to which households they are in: their email and password,
 * the house they were last in, and the one-time links an owner makes when a password is
 * forgotten.
 */
@Service
public class AccountService {

    /** Something@something.something, with no spaces. Real validation is the address working. */
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    public static final String EMAIL_TAKEN = "That email already has an account.";
    /** The name of the index in SchemaTouchUps, so a lost race can be told apart from other failures. */
    public static final String EMAIL_INDEX = "uk_users_email_lower";

    private static final Duration RESET_LIFETIME = Duration.ofHours(24);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

    private final UserRepository userRepository;
    private final HouseholdMemberRepository memberRepository;
    private final PasswordResetRepository resetRepository;
    private final PasswordEncoder passwordEncoder;
    private final SignInAttemptLimiter attemptLimiter;
    private final HouseholdService householdService;

    public AccountService(UserRepository userRepository,
                          HouseholdMemberRepository memberRepository,
                          PasswordResetRepository resetRepository,
                          PasswordEncoder passwordEncoder,
                          SignInAttemptLimiter attemptLimiter,
                          HouseholdService householdService) {
        this.userRepository = userRepository;
        this.memberRepository = memberRepository;
        this.resetRepository = resetRepository;
        this.passwordEncoder = passwordEncoder;
        this.attemptLimiter = attemptLimiter;
        this.householdService = householdService;
    }

    // --- You ---------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public MeResponse me(UUID userId) {
        return toMe(find(userId));
    }

    /**
     * Adds or changes your email and password. The first time there is no password to prove, so
     * being signed in (with your PIN, usually) is enough — that is the whole migration. After
     * that, changing either one asks for the current password, so a phone left unlocked on the
     * counter is not a way to take the account over.
     */
    @Transactional
    public MeResponse updateCredentials(UUID userId, CredentialsRequest request) {
        User user = find(userId);
        boolean changingEmail = request.email() != null && !request.email().isBlank()
                && !normaliseEmail(request.email()).equals(user.getEmail());
        boolean changingPassword = request.password() != null && !request.password().isEmpty();
        if (!changingEmail && !changingPassword) {
            return toMe(user);
        }

        if (user.getPasswordHash() != null) {
            String key = "account:" + userId;
            long lockedFor = attemptLimiter.secondsUntilUnlocked(key);
            if (lockedFor > 0) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "Too many incorrect passwords. " + SignInAttemptLimiter.tryAgainIn(lockedFor));
            }
            String current = request.currentPassword();
            if (current == null || current.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Enter your current password to change these.");
            }
            // 403 rather than 401: this person is signed in, and a 401 would sign them out.
            if (!passwordMatches(current, user.getPasswordHash())) {
                attemptLimiter.recordFailure(key);
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Your current password isn't right.");
            }
            attemptLimiter.recordSuccess(key);
        }

        if (changingPassword) {
            checkPassword(request.password());
        }
        if (changingEmail) {
            claimEmail(user, request.email());
        }
        if (changingPassword) {
            user.setPasswordHash(encodePassword(request.password()));
        }
        return toMe(saveClaimingEmail(user));
    }

    /** Remembers the house you are looking at, so the next sign-in opens it. */
    @Transactional
    public void setActiveHousehold(UUID userId, UUID householdId) {
        householdService.assertMember(householdId, userId);
        User user = find(userId);
        user.setLastHouseholdId(householdId);
        userRepository.save(user);
    }

    /** The remembered house, if they are still in it. A house they left or that was deleted is no answer. */
    @Transactional(readOnly = true)
    public UUID lastHouseholdOf(User user) {
        UUID last = user.getLastHouseholdId();
        return last != null && memberRepository.existsByHouseholdIdAndUserId(last, user.getId()) ? last : null;
    }

    // --- Email addresses ---------------------------------------------------------------------

    /** Trimmed and lowercased: the only form an address is ever stored or compared in. */
    public static String normaliseEmail(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    /**
     * Puts an address on an account, refusing one that belongs to someone else. The check here
     * gives the friendly answer; the unique index is what actually holds when two requests race,
     * and saveClaimingEmail turns that into the same answer.
     */
    public void claimEmail(User user, String email) {
        String normalised = normaliseEmail(email);
        if (normalised == null || normalised.isEmpty() || normalised.length() > 254 || !EMAIL.matcher(normalised).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That doesn't look like an email address.");
        }
        userRepository.findByEmail(normalised)
                .filter(other -> !other.getId().equals(user.getId()))
                .ifPresent(other -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, EMAIL_TAKEN);
                });
        user.setEmail(normalised);
    }

    /** Saves now rather than at commit, so losing a race for an address is a 409 and not a 500. */
    public User saveClaimingEmail(User user) {
        try {
            return userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException e) {
            if (isEmailTaken(e)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, EMAIL_TAKEN);
            }
            throw e;
        }
    }

    public static boolean isEmailTaken(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t.getMessage() != null && t.getMessage().contains(EMAIL_INDEX)) {
                return true;
            }
        }
        return false;
    }

    public static void checkPassword(String password) {
        if (password == null || password.length() < AuthDtos.PASSWORD_MIN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, AuthDtos.PASSWORD_RULE);
        }
        if (password.length() > AuthDtos.PASSWORD_MAX) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Passwords can be at most 128 characters.");
        }
    }

    private static final int BCRYPT_MAX_BYTES = 72;

    /**
     * BCrypt only reads the first 72 bytes, and Spring's encoder refuses anything longer rather
     * than quietly cutting it. A passphrase from a password manager, or a few dozen accented
     * letters or emoji, is past that — so a long password is first boiled down to a fixed-length
     * SHA-256 and that is what BCrypt sees. Short ones go in as they are, which keeps every
     * password saved before this still matching. Always the same rule for the same password, so
     * encoding and matching agree.
     */
    private static String forBcrypt(String password) {
        byte[] bytes = password.getBytes(StandardCharsets.UTF_8);
        if (bytes.length <= BCRYPT_MAX_BYTES) {
            return password;
        }
        try {
            return "sha256:" + Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public String encodePassword(String password) {
        return passwordEncoder.encode(forBcrypt(password));
    }

    /**
     * Also used when there is no account to compare against: a sign-in for an unknown address
     * still pays for one BCrypt compare, so how long the answer takes does not say whether the
     * address has an account.
     */
    public boolean passwordMatches(String password, String hash) {
        if (password == null) {
            return false;
        }
        if (hash == null) {
            passwordEncoder.matches(forBcrypt(password), decoyHash());
            return false;
        }
        return passwordEncoder.matches(forBcrypt(password), hash);
    }

    private volatile String decoyHash;

    private String decoyHash() {
        if (decoyHash == null) {
            decoyHash = passwordEncoder.encode("not anybody's password");
        }
        return decoyHash;
    }

    /**
     * A username for someone who signs up with an email: the part before the @, tidied into
     * what usernames have always looked like, and numbered if it is taken. Nobody types it any
     * more, but it is still the account's name on the PIN screens and in the member list.
     */
    public String usernameFromEmail(String email) {
        String local = normaliseEmail(email);
        int at = local.indexOf('@');
        String base = (at > 0 ? local.substring(0, at) : local).replaceAll("[^a-z0-9._-]", "");
        if (base.length() < 2) {
            base = "cook";
        }
        if (base.length() > 44) {
            base = base.substring(0, 44);
        }
        String candidate = base;
        for (int n = 2; userRepository.existsByUsernameIgnoreCase(candidate); n++) {
            candidate = base + n;
        }
        return candidate;
    }

    // --- Forgotten passwords -----------------------------------------------------------------

    /**
     * An owner makes a one-time link for somebody in their house. Any older link for the same
     * person stops working, so there is only ever one way in to hand out.
     */
    @Transactional
    public PasswordResetLinkResponse createPasswordReset(UUID householdId, UUID ownerId, UUID userId) {
        householdService.assertOwner(householdId, ownerId);
        if (ownerId.equals(userId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Change your own password from Settings.");
        }
        HouseholdMember member = memberRepository.findByHouseholdIdAndUserId(householdId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "They aren't in this household."));
        if (member.cameWithOwnAccount()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "They joined with an account they already had, so they change their password themselves, from Settings.");
        }
        if (!vouchesFor(ownerId, userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "They're in another household too, so they change their password themselves, from Settings.");
        }

        Instant now = Instant.now();
        for (PasswordReset older : resetRepository.findByUserIdAndUsedAtIsNull(userId)) {
            older.setUsedAt(now);
        }

        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = ENCODER.encodeToString(bytes);
        PasswordReset reset = resetRepository.save(PasswordReset.builder()
                .tokenHash(hash(token))
                .user(member.getUser())
                .createdBy(ownerId)
                .createdAt(now)
                .expiresAt(now.plus(RESET_LIFETIME))
                .build());
        return new PasswordResetLinkResponse(token, reset.getExpiresAt());
    }

    /**
     * Whether an owner may hand out a way into somebody's account. Owning a house they are in is
     * not enough on its own: anyone can make a household, and adding an existing account to one
     * does not ask that person. So the owner has to own every house the person is in, and the
     * person must own none — then the only people this account is shared with are the owner's.
     * Someone in two families' houses changes their own password; nobody else can.
     *
     * Nor does a membership count that brought an account the house did not make. An account
     * left in no house — theirs was deleted, or they walked out of it — would otherwise pass the
     * moment it joined a stranger's house, since that house is then all it is in: pulled in by
     * username in the old days, or now by being talked into opening the stranger's invite. So
     * none of their memberships may be one their existing account came into.
     */
    private boolean vouchesFor(UUID ownerId, UUID userId) {
        List<HouseholdMember> theirs = memberRepository.findByUserId(userId);
        return !theirs.isEmpty() && theirs.stream().allMatch(m -> m.getRole() != HouseholdRole.OWNER
                && !m.cameWithOwnAccount()
                && memberRepository.findByHouseholdIdAndUserId(m.getHousehold().getId(), ownerId)
                        .map(mine -> mine.getRole() == HouseholdRole.OWNER)
                        .orElse(false));
    }

    /** What the reset page shows before anything is typed. An unknown token is simply not valid. */
    @Transactional(readOnly = true)
    public PasswordResetInfo describeReset(String token) {
        return resetRepository.findByTokenHash(hash(token))
                .map(r -> new PasswordResetInfo(
                        r.isLive(Instant.now()) && vouchesFor(r.getCreatedBy(), r.getUser().getId()),
                        r.getUser().getDisplayName(),
                        r.getUser().getEmail() != null))
                .orElse(new PasswordResetInfo(false, null, false));
    }

    /**
     * Uses a reset link: sets the password, adds an email if they never had one, and spends the
     * link. Returns the account so the caller can sign them straight in.
     *
     * The link only ever sets a password. An address already on the account stays — the link is
     * for getting back in, not for moving the account to somebody else's inbox.
     */
    @Transactional
    public User useReset(String token, String password, String email) {
        PasswordReset reset = resetRepository.findByTokenHash(hash(token))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "That reset link isn't one of ours."));
        Instant now = Instant.now();
        User user = reset.getUser();
        // Checked again now, not only when the link was made: if they have since left the
        // owner's house, or joined another, the owner no longer speaks for this account.
        if (!reset.isLive(now) || !vouchesFor(reset.getCreatedBy(), user.getId())) {
            throw new ResponseStatusException(HttpStatus.GONE,
                    "This reset link has been used or has expired. Ask for a new one.");
        }
        checkPassword(password);
        boolean needsEmail = user.getEmail() == null;
        if (needsEmail && (email == null || email.isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Add an email too — it's what you'll sign in with.");
        }
        // Spent with a conditional update, so two people opening the same link at once cannot
        // both get through: only the one that flips it from unused counts. Anything refused
        // after this rolls the spending back with it.
        if (resetRepository.spend(reset.getId(), now) != 1) {
            throw new ResponseStatusException(HttpStatus.GONE,
                    "This reset link has been used or has expired. Ask for a new one.");
        }
        reset.setUsedAt(now); // the row already says so; this keeps the loaded copy agreeing
        if (needsEmail) {
            claimEmail(user, email);
        }
        user.setPasswordHash(encodePassword(password));
        User saved = saveClaimingEmail(user);
        // A forgotten password usually comes after a few wrong ones.
        attemptLimiter.recordSuccess("email:" + saved.getEmail());
        return saved;
    }

    private static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private User find(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    private MeResponse toMe(User user) {
        return new MeResponse(user.getId(), user.getUsername(), user.getDisplayName(),
                user.getPinHash() != null, user.getEmail(), user.getPasswordHash() != null,
                lastHouseholdOf(user));
    }
}
