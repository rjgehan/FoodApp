package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.PasswordReset;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.AuthDtos.AuthResponse;
import com.gehan.mealplanner.dto.AuthDtos.EmailLoginRequest;
import com.gehan.mealplanner.dto.AuthDtos.LoginRequest;
import com.gehan.mealplanner.dto.AuthDtos.PasswordResetLinkResponse;
import com.gehan.mealplanner.dto.AuthDtos.SetPinRequest;
import com.gehan.mealplanner.dto.AuthDtos.UsePasswordResetRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.AddMemberRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateUserRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CredentialsRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.MeResponse;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.PasswordResetRepository;
import com.gehan.mealplanner.repository.UserRepository;
import com.gehan.mealplanner.security.JwtService;
import com.gehan.mealplanner.security.SignInAttemptLimiter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Email and password sign-in against the real database: the rules for adding and changing
 * them, one account per address however it is typed, the remembered household, owner reset
 * links, and the switch that retires the PIN screens. Rolled back after each test.
 */
@SpringBootTest
@Transactional
class AccountDatabaseTest {

    @Autowired AccountService accountService;
    @Autowired AuthService authService;
    @Autowired HouseholdService householdService;
    @Autowired UserRepository userRepository;
    @Autowired HouseholdRepository householdRepository;
    @Autowired HouseholdMemberRepository memberRepository;
    @Autowired PasswordResetRepository resetRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JwtService jwtService;
    @Autowired SignInAttemptLimiter limiter;

    private User owner;
    private User member;
    private UUID householdId;
    private String tag;

    @BeforeEach
    void household() {
        tag = UUID.randomUUID().toString().substring(0, 8);
        owner = userRepository.save(User.builder()
                .username("acct-owner-" + tag).displayName("Owner").pinHash(passwordEncoder.encode("1234")).build());
        householdId = householdService.create(owner.getId(), new CreateHouseholdRequest("Accounts IT")).id();
        // Given their account in this house, the way the owner can vouch for them — not pulled
        // in by username, which never can be.
        member = newAccountIn(householdId, "acct-member-" + tag);
        member.setDisplayName("Member");
        member.setPinHash(passwordEncoder.encode("4321"));
        member = userRepository.save(member);
    }

    private User newAccountIn(UUID household, String username) {
        UUID id = householdService.createUser(household, owner.getId(), new CreateUserRequest(username, null)).userId();
        return userRepository.findById(id).orElseThrow();
    }

    private String email(String who) {
        return who + "-" + tag + "@example.com";
    }

    @Test
    void theFirstEmailAndPasswordNeedNoCurrentPasswordButChangesDo() {
        MeResponse first = accountService.updateCredentials(member.getId(),
                new CredentialsRequest("  " + email("Member").toUpperCase() + " ", "first-password", null));
        assertThat(first.email()).isEqualTo(email("member"));
        assertThat(first.hasPassword()).isTrue();

        assertThatThrownBy(() -> accountService.updateCredentials(member.getId(),
                new CredentialsRequest(null, "second-password", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(400));
        assertThatThrownBy(() -> accountService.updateCredentials(member.getId(),
                new CredentialsRequest(email("other"), null, "wrong-password")))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(403));

        MeResponse changed = accountService.updateCredentials(member.getId(),
                new CredentialsRequest(email("renamed"), "second-password", "first-password"));
        assertThat(changed.email()).isEqualTo(email("renamed"));
        assertThat(authService.loginWithEmail(new EmailLoginRequest(email("renamed"), "second-password")).userId())
                .isEqualTo(member.getId());
    }

    @Test
    void passwordsHaveAMinimumAndMaximumLength() {
        assertThatThrownBy(() -> accountService.updateCredentials(member.getId(),
                new CredentialsRequest(email("member"), "short", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(400));
        assertThatThrownBy(() -> accountService.updateCredentials(member.getId(),
                new CredentialsRequest(email("member"), "x".repeat(129), null)))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> accountService.updateCredentials(member.getId(),
                new CredentialsRequest("not-an-email", "long-enough", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(400));
        // Nothing was half-saved by the refusals.
        assertThat(accountService.me(member.getId())).extracting(MeResponse::email, MeResponse::hasPassword)
                .containsExactly(null, false);
    }

    @Test
    void anAddressBelongsToOneAccountHoweverItIsTyped() {
        accountService.updateCredentials(owner.getId(), new CredentialsRequest(email("shared"), "password-one", null));
        String sameAddress = "  " + email("SHARED").replace("example.com", "Example.COM") + "\t";
        assertThatThrownBy(() -> accountService.updateCredentials(member.getId(),
                new CredentialsRequest(sameAddress, "password-two", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode().value()).isEqualTo(409);
                    assertThat(e.getReason()).isEqualTo("That email already has an account.");
                });
        // Saying your own address again is not a clash.
        assertThat(accountService.updateCredentials(owner.getId(),
                new CredentialsRequest(email("SHARED"), null, "password-one")).email()).isEqualTo(email("shared"));
    }

    @Test
    void theDatabaseItselfRefusesASecondAccountForAnAddress() {
        // Straight past the service's check, the way a lost race would arrive.
        owner.setEmail(email("raw"));
        userRepository.saveAndFlush(owner);
        member.setEmail(email("RAW"));
        assertThatThrownBy(() -> userRepository.saveAndFlush(member))
                .isInstanceOf(DataIntegrityViolationException.class)
                .satisfies(e -> assertThat(AccountService.isEmailTaken(e)).isTrue());
    }

    @Test
    void emailSignInIgnoresCaseAndSpacesAndLocksAfterFiveWrongPasswords() {
        accountService.updateCredentials(member.getId(), new CredentialsRequest(email("login"), "right-password", null));

        assertThat(authService.loginWithEmail(new EmailLoginRequest(" " + email("LOGIN") + " ", "right-password")).userId())
                .isEqualTo(member.getId());
        assertThatThrownBy(() -> authService.loginWithEmail(new EmailLoginRequest(email("nobody"), "right-password")))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode().value()).isEqualTo(401);
                    assertThat(e.getReason()).isEqualTo("Incorrect email or password");
                });

        for (int i = 0; i < 5; i++) {
            assertThatThrownBy(() -> authService.loginWithEmail(new EmailLoginRequest(email("Login"), "wrong-password")))
                    .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(401));
        }
        // Locked, even for the right password, and however the address is capitalised.
        assertThatThrownBy(() -> authService.loginWithEmail(new EmailLoginRequest(email("LOGIN"), "right-password")))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(429));
        limiter.recordSuccess("email:" + email("login"));
    }

    @Test
    void signingInOpensTheHouseholdYouWereLastIn() {
        UUID second = householdService.create(member.getId(), new CreateHouseholdRequest("Second IT")).id();

        accountService.setActiveHousehold(member.getId(), second);
        AuthResponse viaPin = authService.login(new LoginRequest(member.getUsername(), "4321", null));
        assertThat(viaPin.lastHouseholdId()).isEqualTo(second);

        // Tapping a house on the PIN screens is choosing it.
        AuthResponse picked = authService.login(new LoginRequest(member.getUsername(), "4321", householdId));
        assertThat(picked.lastHouseholdId()).isEqualTo(householdId);

        // A house you are not in cannot be remembered…
        UUID elsewhere = householdService.create(owner.getId(), new CreateHouseholdRequest("Elsewhere IT")).id();
        assertThatThrownBy(() -> accountService.setActiveHousehold(member.getId(), elsewhere))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(403));
        // …and one you have left is forgotten.
        householdService.leave(householdId, member.getId());
        assertThat(authService.refresh(member.getId()).lastHouseholdId()).isNull();
    }

    @Test
    void anOwnerResetLinkWorksOnceAndOnlyForADay() {
        PasswordResetLinkResponse link = accountService.createPasswordReset(householdId, owner.getId(), member.getId());
        assertThat(accountService.describeReset(link.token()))
                .satisfies(info -> {
                    assertThat(info.valid()).isTrue();
                    assertThat(info.displayName()).isEqualTo("Member");
                    assertThat(info.hasEmail()).isFalse();
                });

        // No email on the account, so the new password has to come with one.
        assertThatThrownBy(() -> authService.usePasswordReset(new UsePasswordResetRequest(link.token(), "brand-new-pw", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(400));
        AuthResponse signedIn = authService.usePasswordReset(
                new UsePasswordResetRequest(link.token(), "brand-new-pw", email("Reset")));
        assertThat(signedIn.userId()).isEqualTo(member.getId());
        assertThat(authService.loginWithEmail(new EmailLoginRequest(email("reset"), "brand-new-pw")).token()).isNotBlank();

        assertThat(accountService.describeReset(link.token()).valid()).isFalse();
        assertThatThrownBy(() -> authService.usePasswordReset(new UsePasswordResetRequest(link.token(), "again-and-again", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(410));

        PasswordResetLinkResponse later = accountService.createPasswordReset(householdId, owner.getId(), member.getId());
        PasswordReset stored = resetRepository.findByUserIdAndUsedAtIsNull(member.getId()).get(0);
        stored.setExpiresAt(Instant.now().minusSeconds(1));
        resetRepository.saveAndFlush(stored);
        assertThat(accountService.describeReset(later.token()).valid()).isFalse();
        assertThatThrownBy(() -> authService.usePasswordReset(new UsePasswordResetRequest(later.token(), "too-late-now", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(410));

        assertThat(accountService.describeReset("not-a-token").valid()).isFalse();
    }

    @Test
    void aNewResetLinkRetiresTheOldOneAndOnlyTheOwnerCanMakeThem() {
        PasswordResetLinkResponse first = accountService.createPasswordReset(householdId, owner.getId(), member.getId());
        accountService.createPasswordReset(householdId, owner.getId(), member.getId());
        assertThat(accountService.describeReset(first.token()).valid()).isFalse();

        assertThatThrownBy(() -> accountService.createPasswordReset(householdId, member.getId(), owner.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(403));
        User stranger = userRepository.save(User.builder().username("acct-stranger-" + tag).displayName("Stranger").build());
        assertThatThrownBy(() -> accountService.createPasswordReset(householdId, owner.getId(), stranger.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(404));
    }

    @Test
    void anAccountWithAPasswordCannotBeGivenAPinByAStranger() {
        User passwordOnly = newAccountIn(householdId, "acct-pwonly-" + tag);
        PasswordResetLinkResponse link = accountService.createPasswordReset(householdId, owner.getId(), passwordOnly.getId());
        authService.usePasswordReset(new UsePasswordResetRequest(link.token(), "their-own-pw", email("pwonly")));

        assertThatThrownBy(() -> authService.setInitialPin(new SetPinRequest(passwordOnly.getUsername(), "0000", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(409));
        assertThat(userRepository.findById(passwordOnly.getId()).orElseThrow().getPinHash()).isNull();
        // The roster no longer offers "choose your PIN" for them.
        assertThat(authService.listHouseholdUsers(householdId))
                .filteredOn(u -> u.username().equals(passwordOnly.getUsername()))
                .singleElement().satisfies(u -> assertThat(u.pinSet()).isTrue());
    }

    @Test
    void anOwnerCannotResetSomebodyTheyPulledInFromAnotherHouse() {
        // The attack: make a house, add somebody by username, and "reset" their password.
        User attacker = userRepository.save(User.builder()
                .username("acct-attacker-" + tag).displayName("Attacker").pinHash(passwordEncoder.encode("9999")).build());
        UUID den = householdService.create(attacker.getId(), new CreateHouseholdRequest("Den IT")).id();
        householdService.addMember(den, attacker.getId(), new AddMemberRequest(member.getUsername()));
        householdService.addMember(den, attacker.getId(), new AddMemberRequest(owner.getUsername()));

        assertThatThrownBy(() -> accountService.createPasswordReset(den, attacker.getId(), member.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(403));
        assertThatThrownBy(() -> accountService.createPasswordReset(den, attacker.getId(), owner.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(403));
        // And the real owner cannot reset them now either: they are somebody else's too.
        assertThatThrownBy(() -> accountService.createPasswordReset(householdId, owner.getId(), member.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(403));
    }

    @Test
    void anAccountLeftInNoHouseCannotBePulledIntoAnotherAndReset() {
        // Their house is deleted, so they are in none. Adding them to a house of your own would
        // make it everything they are in — which must still not let you reset them.
        accountService.updateCredentials(member.getId(), new CredentialsRequest(email("homeless"), "their-password", null));
        PasswordResetLinkResponse before = accountService.createPasswordReset(householdId, owner.getId(), member.getId());
        householdService.delete(householdId, owner.getId());
        assertThat(memberRepository.findByUserId(member.getId())).isEmpty();

        User attacker = userRepository.save(User.builder()
                .username("acct-taker-" + tag).displayName("Taker").pinHash(passwordEncoder.encode("9999")).build());
        UUID den = householdService.create(attacker.getId(), new CreateHouseholdRequest("Den IT")).id();
        householdService.addMember(den, attacker.getId(), new AddMemberRequest(member.getUsername()));

        assertThatThrownBy(() -> accountService.createPasswordReset(den, attacker.getId(), member.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(403));
        // Nor does a link the old owner made before the house went come back to life.
        assertThat(accountService.describeReset(before.token()).valid()).isFalse();
        assertThat(authService.loginWithEmail(new EmailLoginRequest(email("homeless"), "their-password")).userId())
                .isEqualTo(member.getId());
    }

    @Test
    void aResetLinkStopsWorkingWhenTheOwnerNoLongerSpeaksForThem() {
        PasswordResetLinkResponse link = accountService.createPasswordReset(householdId, owner.getId(), member.getId());
        householdService.create(member.getId(), new CreateHouseholdRequest("Their own IT"));
        assertThat(accountService.describeReset(link.token()).valid()).isFalse();
        assertThatThrownBy(() -> authService.usePasswordReset(new UsePasswordResetRequest(link.token(), "brand-new-pw", email("gone"))))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(410));
    }

    @Test
    void aResetLinkSetsThePasswordButLeavesAnExistingEmailAlone() {
        accountService.updateCredentials(member.getId(), new CredentialsRequest(email("kept"), "first-password", null));
        PasswordResetLinkResponse link = accountService.createPasswordReset(householdId, owner.getId(), member.getId());
        authService.usePasswordReset(new UsePasswordResetRequest(link.token(), "second-password", email("hijack")));

        assertThat(accountService.me(member.getId()).email()).isEqualTo(email("kept"));
        assertThat(authService.loginWithEmail(new EmailLoginRequest(email("kept"), "second-password")).userId())
                .isEqualTo(member.getId());
    }

    @Test
    void longAndMultibytePasswordsAreKeptInFull() {
        // Past BCrypt's 72 bytes: both must save, sign in, and differ from a password that only
        // shares their first 72 bytes.
        String longOne = "correct horse battery staple ".repeat(4);
        String emoji = "🍝🥕🍗🌮".repeat(6);
        accountService.updateCredentials(member.getId(), new CredentialsRequest(email("long"), longOne, null));
        assertThat(authService.loginWithEmail(new EmailLoginRequest(email("long"), longOne)).userId()).isEqualTo(member.getId());
        assertThatThrownBy(() -> authService.loginWithEmail(new EmailLoginRequest(email("long"), longOne.substring(0, 80))))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(401));

        accountService.updateCredentials(member.getId(), new CredentialsRequest(null, emoji, longOne));
        assertThat(authService.loginWithEmail(new EmailLoginRequest(email("long"), emoji)).userId()).isEqualTo(member.getId());
        limiter.recordSuccess("email:" + email("long"));
    }

    @Test
    void withThePinScreensOffTheRosterIsPrivateAndPinSignInIsGone() {
        AuthService pinOff = new AuthService(userRepository, householdRepository, memberRepository, passwordEncoder,
                jwtService, limiter, householdService, accountService, false);

        var landing = pinOff.landing();
        assertThat(landing.legacyPinLogin()).isFalse();
        assertThat(landing.households()).isEmpty();
        assertThat(landing.unassigned()).isEmpty();

        for (Runnable call : new Runnable[] {
                () -> pinOff.login(new LoginRequest(member.getUsername(), "4321", null)),
                () -> pinOff.setInitialPin(new SetPinRequest(member.getUsername(), "4321", null)),
                () -> pinOff.listHouseholdUsers(householdId),
                () -> pinOff.findUser(member.getUsername()),
        }) {
            assertThatThrownBy(call::run)
                    .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(410));
        }

        accountService.updateCredentials(member.getId(), new CredentialsRequest(email("pinoff"), "still-works", null));
        assertThat(pinOff.loginWithEmail(new EmailLoginRequest(email("pinoff"), "still-works")).userId()).isEqualTo(member.getId());
    }

    @Test
    void usernamesMadeFromAnEmailAreTidyAndUnique() {
        assertThat(accountService.usernameFromEmail("Jo.Smith+food@Example.com")).isEqualTo("jo.smithfood");
        assertThat(accountService.usernameFromEmail("x@example.com")).startsWith("cook");
        userRepository.save(User.builder().username("taken-" + tag).displayName("Taken").build());
        assertThat(accountService.usernameFromEmail("Taken-" + tag + "@example.com")).isEqualTo("taken-" + tag + "2");
    }
}
