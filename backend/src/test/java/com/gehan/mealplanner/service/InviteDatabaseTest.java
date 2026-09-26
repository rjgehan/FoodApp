package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.HouseholdInvite;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.AuthDtos.AuthResponse;
import com.gehan.mealplanner.dto.AuthDtos.EmailLoginRequest;
import com.gehan.mealplanner.dto.AuthDtos.SignupRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.HouseholdResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.InviteInfo;
import com.gehan.mealplanner.dto.HouseholdDtos.InviteResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.InviteStanding;
import com.gehan.mealplanner.repository.HouseholdInviteRepository;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Invite links and taking people out of a house, against the real database: one live link per
 * house, what a link tells a stranger, joining and signing up through one, and the owner's
 * Remove. Rolled back after each test.
 */
@SpringBootTest
@Transactional
class InviteDatabaseTest {

    @Autowired InviteService inviteService;
    @Autowired AuthService authService;
    @Autowired AccountService accountService;
    @Autowired HouseholdService householdService;
    @Autowired UserRepository userRepository;
    @Autowired HouseholdMemberRepository memberRepository;
    @Autowired HouseholdInviteRepository inviteRepository;

    private User owner;
    private User stranger;
    private UUID householdId;
    private String tag;

    @BeforeEach
    void household() {
        tag = UUID.randomUUID().toString().substring(0, 8);
        owner = userRepository.save(User.builder().username("inv-owner-" + tag).displayName("Owner").build());
        stranger = userRepository.save(User.builder().username("inv-stranger-" + tag).displayName("Stranger").build());
        householdId = householdService.create(owner.getId(), new CreateHouseholdRequest("Invites IT")).id();
    }

    private String email(String who) {
        return who + "-" + tag + "@example.com";
    }

    private static Consumer<ResponseStatusException> status(int expected) {
        return e -> assertThat(e.getStatusCode().value()).isEqualTo(expected);
    }

    @Test
    void aHouseholdHasOneLinkUntilItRunsOutOrIsThrownAway() {
        InviteResponse first = inviteService.getOrCreate(householdId, owner.getId());
        assertThat(first.token()).hasSizeGreaterThanOrEqualTo(43).matches("[A-Za-z0-9_-]+");
        assertThat(Duration.between(Instant.now(), first.expiresAt())).isBetween(Duration.ofDays(7).minusMinutes(1), Duration.ofDays(7));
        assertThat(inviteService.getOrCreate(householdId, owner.getId()).token()).isEqualTo(first.token());

        // Anybody in the house sees the same link; nobody outside it sees any.
        User member = join(first.token(), stranger);
        assertThat(inviteService.getOrCreate(householdId, member.getId()).token()).isEqualTo(first.token());
        User outsider = userRepository.save(User.builder().username("inv-out-" + tag).displayName("Out").build());
        assertThatThrownBy(() -> inviteService.getOrCreate(householdId, outsider.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, status(403));

        // Only the owner throws it away, and then the old one is dead and a new one is made.
        assertThatThrownBy(() -> inviteService.revoke(householdId, member.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, status(403));
        inviteService.revoke(householdId, owner.getId());
        assertThat(inviteService.describe(first.token()).valid()).isFalse();
        InviteResponse second = inviteService.getOrCreate(householdId, member.getId());
        assertThat(second.token()).isNotEqualTo(first.token());

        // A week later it has run out, and the next person to look gets a fresh one.
        HouseholdInvite stored = inviteRepository.findByToken(second.token()).orElseThrow();
        stored.setExpiresAt(Instant.now().minusSeconds(1));
        inviteRepository.saveAndFlush(stored);
        assertThat(inviteService.describe(second.token()).valid()).isFalse();
        assertThatThrownBy(() -> inviteService.accept(second.token(), outsider.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, status(410));
        InviteResponse third = inviteService.getOrCreate(householdId, owner.getId());
        assertThat(third.token()).isNotEqualTo(second.token());
        assertThat(inviteRepository.findByHouseholdIdAndRevokedAtIsNull(householdId)).hasSize(1);
    }

    @Test
    void aLinkTellsAStrangerTheHouseAndWhoAskedAndNothingMore() {
        InviteResponse link = inviteService.getOrCreate(householdId, owner.getId());
        InviteInfo info = inviteService.describe(link.token());
        assertThat(info).isEqualTo(new InviteInfo("Invites IT", "Owner", 1, true));
        assertThat(inviteService.describe("not-a-real-token")).isEqualTo(new InviteInfo(null, null, null, false));
    }

    @Test
    void acceptingIsIdempotentAndOpensThatHouseNextTime() {
        String token = inviteService.getOrCreate(householdId, owner.getId()).token();
        HouseholdResponse joined = inviteService.accept(token, stranger.getId());
        assertThat(joined.id()).isEqualTo(householdId);
        assertThat(joined.memberCount()).isEqualTo(2);
        assertThat(joined.role().name()).isEqualTo("MEMBER");

        // Twice is just being in already.
        assertThat(inviteService.accept(token, stranger.getId()).memberCount()).isEqualTo(2);
        assertThat(inviteRepository.findByToken(token).orElseThrow().getUseCount()).isEqualTo(1);
        assertThat(authService.refresh(stranger.getId(), true).lastHouseholdId()).isEqualTo(householdId);

        assertThatThrownBy(() -> inviteService.accept("not-a-real-token", stranger.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, status(404));
    }

    @Test
    void signingUpNeedsALinkThatWorksAndMakesAnAccountInThatHouse() {
        String token = inviteService.getOrCreate(householdId, owner.getId()).token();

        AuthResponse auth = authService.signUp(new SignupRequest(token, "  Newcomer ", "  " + email("New").toUpperCase(), "their-password"));
        assertThat(auth.token()).isNotBlank();
        assertThat(auth.displayName()).isEqualTo("Newcomer");
        assertThat(auth.lastHouseholdId()).isEqualTo(householdId);
        assertThat(memberRepository.existsByHouseholdIdAndUserId(householdId, auth.userId())).isTrue();
        assertThat(authService.loginWithEmail(new EmailLoginRequest(email("new"), "their-password")).userId())
                .isEqualTo(auth.userId());
        assertThat(userRepository.findById(auth.userId()).orElseThrow().getUsername()).startsWith("new-" + tag);

        // The address is taken now, however it is typed.
        assertThatThrownBy(() -> authService.signUp(new SignupRequest(token, "Again", email("NEW"), "their-password")))
                .isInstanceOfSatisfying(ResponseStatusException.class, status(409));
        assertThatThrownBy(() -> authService.signUp(new SignupRequest(token, "Short", email("short"), "short")))
                .isInstanceOfSatisfying(ResponseStatusException.class, status(400));
        assertThatThrownBy(() -> authService.signUp(new SignupRequest("made-up", "Nobody", email("nobody"), "long-enough")))
                .isInstanceOfSatisfying(ResponseStatusException.class, status(404));

        inviteService.revoke(householdId, owner.getId());
        assertThatThrownBy(() -> authService.signUp(new SignupRequest(token, "Late", email("late"), "long-enough")))
                .isInstanceOfSatisfying(ResponseStatusException.class, status(410));
        assertThat(userRepository.findByEmail(email("late"))).isEmpty();
        assertThat(userRepository.findByEmail(email("short"))).isEmpty();
    }

    @Test
    void theOwnerCanVouchForAnAccountMadeThroughTheirLinkButNotOneThatJoinedWithItsOwn() {
        String token = inviteService.getOrCreate(householdId, owner.getId()).token();
        // Made there and then, in this house: a forgotten password is the owner's to reset.
        AuthResponse made = authService.signUp(new SignupRequest(token, "Made here", email("made"), "their-password"));
        assertThat(accountService.createPasswordReset(householdId, owner.getId(), made.userId()).token()).isNotBlank();

        // An account that already existed — here, one in no other house — said yes to joining,
        // not to this owner being able to hand out a way into it.
        User joined = join(token, stranger);
        assertThatThrownBy(() -> accountService.createPasswordReset(householdId, owner.getId(), joined.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, status(403));
    }

    @Test
    void aLinkNamesTheOwnerWhoeverHappenedToMakeIt() {
        String token = inviteService.getOrCreate(householdId, owner.getId()).token();
        User member = join(token, stranger);
        inviteService.revoke(householdId, owner.getId());
        // The member opens the Invite card first, so the new link is theirs on paper.
        String fresh = inviteService.getOrCreate(householdId, member.getId()).token();
        assertThat(inviteService.describe(fresh).invitedByName()).isEqualTo("Owner");
    }

    @Test
    void sayingYesTellsSomebodyAlreadyInThatTheyAre() {
        String token = inviteService.getOrCreate(householdId, owner.getId()).token();
        assertThat(inviteService.standing(token, stranger.getId())).isEqualTo(new InviteStanding(false, null));
        join(token, stranger);
        assertThat(inviteService.standing(token, stranger.getId())).isEqualTo(new InviteStanding(true, householdId));
        assertThat(inviteService.standing(token, owner.getId()).alreadyMember()).isTrue();
    }

    @Test
    void theOwnerRemovesSomebodyButNotThemselvesAndNobodyElseCan() {
        String token = inviteService.getOrCreate(householdId, owner.getId()).token();
        User member = join(token, stranger);
        User other = join(token, userRepository.save(User.builder().username("inv-other-" + tag).displayName("Other").build()));

        assertThatThrownBy(() -> householdService.removeMember(householdId, member.getId(), other.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, status(403));
        assertThatThrownBy(() -> householdService.removeMember(householdId, owner.getId(), owner.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, status(409));
        User outsider = userRepository.save(User.builder().username("inv-out2-" + tag).displayName("Out").build());
        assertThatThrownBy(() -> householdService.removeMember(householdId, owner.getId(), outsider.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, status(404));

        householdService.removeMember(householdId, owner.getId(), member.getId());
        assertThat(memberRepository.existsByHouseholdIdAndUserId(householdId, member.getId())).isFalse();
        // The link they had seen goes with them, so they cannot let themselves back in.
        assertThatThrownBy(() -> inviteService.accept(token, member.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, status(410));
        assertThat(inviteService.getOrCreate(householdId, owner.getId()).token()).isNotEqualTo(token);
        // The house they were last in is forgotten, so their next sign-in does not aim at it.
        assertThat(authService.refresh(member.getId(), true).lastHouseholdId()).isNull();
        assertThatThrownBy(() -> householdService.assertMember(householdId, member.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, status(403));
    }

    @Test
    void deletingAHouseholdTakesItsLinkWithIt() {
        String token = inviteService.getOrCreate(householdId, owner.getId()).token();
        // Deleting is plain SQL, which does not see what JPA has not written yet.
        inviteRepository.flush();
        householdService.delete(householdId, owner.getId());
        assertThat(inviteRepository.findByToken(token)).isEmpty();
    }

    private User join(String token, User who) {
        inviteService.accept(token, who.getId());
        return who;
    }
}
