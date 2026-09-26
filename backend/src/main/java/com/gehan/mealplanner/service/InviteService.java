package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.HouseholdInvite;
import com.gehan.mealplanner.domain.HouseholdMember;
import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.AuthDtos.SignupRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.HouseholdResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.InviteInfo;
import com.gehan.mealplanner.dto.HouseholdDtos.InviteResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.InviteStanding;
import com.gehan.mealplanner.repository.HouseholdInviteRepository;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

/**
 * Getting people into a household. There is exactly one way into a house somebody else made: its
 * invite link, opened by the person joining — who either signs in and says yes, or makes their
 * account right there. Adding someone by their username, which never asked them, is gone, and so
 * are accounts made on somebody's behalf: both were how a stranger could end up in a house they
 * never chose, and from there have their password "reset" by its owner.
 */
@Service
public class InviteService {

    static final Duration LIFETIME = Duration.ofDays(7);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

    private final HouseholdInviteRepository inviteRepository;
    private final HouseholdRepository householdRepository;
    private final HouseholdMemberRepository memberRepository;
    private final UserRepository userRepository;
    private final HouseholdService householdService;
    private final AccountService accountService;

    public InviteService(HouseholdInviteRepository inviteRepository,
                         HouseholdRepository householdRepository,
                         HouseholdMemberRepository memberRepository,
                         UserRepository userRepository,
                         HouseholdService householdService,
                         AccountService accountService) {
        this.inviteRepository = inviteRepository;
        this.householdRepository = householdRepository;
        this.memberRepository = memberRepository;
        this.userRepository = userRepository;
        this.householdService = householdService;
        this.accountService = accountService;
    }

    /**
     * The household's link, made the first time anyone asks and whenever the last one ran out or
     * was thrown away. Any member can see it — handing it to a sister is not an owner's job.
     *
     * The household row is locked while this runs, so two phones opening the Invite card at once
     * get the same link rather than one each, which would leave one of them showing a dead one.
     */
    @Transactional
    public InviteResponse getOrCreate(UUID householdId, UUID userId) {
        householdService.assertMember(householdId, userId);
        Household household = householdRepository.lockById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));

        Instant now = Instant.now();
        HouseholdInvite live = null;
        for (HouseholdInvite invite : inviteRepository.findByHouseholdIdAndRevokedAtIsNull(householdId)) {
            if (live == null && invite.isLive(now)) {
                live = invite;
            } else {
                // Run out, or somehow a second one: either way not the link to hand out.
                invite.setRevokedAt(now);
            }
        }
        if (live == null) {
            byte[] bytes = new byte[32];
            RANDOM.nextBytes(bytes);
            live = inviteRepository.save(HouseholdInvite.builder()
                    .household(household)
                    .token(ENCODER.encodeToString(bytes))
                    .createdBy(userId)
                    .createdAt(now)
                    .expiresAt(now.plus(LIFETIME))
                    .build());
        }
        return new InviteResponse(live.getToken(), live.getExpiresAt());
    }

    /**
     * Throws the link away — sent to the wrong person, or posted somewhere it should not be. The
     * next person to open the Invite card gets a new one. Owner only: it breaks a link other
     * people in the house may already have sent.
     */
    @Transactional
    public void revoke(UUID householdId, UUID ownerId) {
        householdService.assertOwner(householdId, ownerId);
        householdService.retireInvites(householdId);
    }

    /**
     * What the link says to whoever opens it, before they sign in or say yes. The house, who
     * asked, and how many live there — enough to know it is the right one, and no names beyond
     * the inviter's. A link that does not work says nothing at all.
     *
     * "Who asked" is the house's owner. The link belongs to the house, not to one person in it:
     * whoever happens to open the Invite card first after it is replaced is who makes it, and
     * naming them would tell somebody the owner sent it to that a child had.
     */
    @Transactional(readOnly = true)
    public InviteInfo describe(String token) {
        return inviteRepository.findByToken(token)
                .filter(invite -> invite.isLive(Instant.now()))
                .map(invite -> new InviteInfo(
                        invite.getHousehold().getName(),
                        inviterName(invite),
                        (int) memberRepository.countByHouseholdId(invite.getHousehold().getId()),
                        true))
                .orElse(new InviteInfo(null, null, null, false));
    }

    private String inviterName(HouseholdInvite invite) {
        UUID householdId = invite.getHousehold().getId();
        return memberRepository.findByHouseholdId(householdId).stream()
                .filter(m -> m.getRole() == HouseholdRole.OWNER)
                .map(m -> m.getUser().getDisplayName())
                .findFirst()
                .or(() -> userRepository.findById(invite.getCreatedBy()).map(User::getDisplayName))
                .orElse(null);
    }

    /**
     * Whether the signed-in person opening a link is in that house already — somebody checking
     * the link they just sent works, or scanning their own code — so the page can say so rather
     * than invite them into a house they are standing in. The house's id only for a member.
     */
    @Transactional(readOnly = true)
    public InviteStanding standing(String token, UUID userId) {
        HouseholdInvite invite = liveInvite(token);
        UUID householdId = invite.getHousehold().getId();
        boolean member = memberRepository.existsByHouseholdIdAndUserId(householdId, userId);
        return new InviteStanding(member, member ? householdId : null);
    }

    /**
     * Somebody signed in says yes. Saying it twice is fine — they are simply already in — and
     * either way the house becomes the one they open next.
     *
     * The household row is locked first, so a double tap, or the phone's own join racing the
     * button, finds the first one in rather than both trying to add the same row — and somebody
     * the owner is removing at that moment finds the link already dead, not still open.
     */
    @Transactional
    public HouseholdResponse accept(String token, UUID userId) {
        HouseholdInvite invite = lockedLiveInvite(token);
        UUID householdId = invite.getHousehold().getId();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        if (!memberRepository.existsByHouseholdIdAndUserId(householdId, userId)) {
            // An account they already had: the house did not make it, so its owner does not get
            // to reset its password. See HouseholdMember.broughtOwnAccount.
            join(invite, user, true);
        }
        user.setLastHouseholdId(householdId);
        userRepository.save(user);
        return householdService.responseFor(householdId, userId);
    }

    /**
     * A brand new account, made by the person it belongs to, straight into the house that
     * invited them. The username is made from the email: nobody types it, but the PIN screens
     * and the member list still show one.
     *
     * Locks the house as accepting does, so a link the owner is throwing away at that moment
     * lets nobody in afterwards.
     */
    @Transactional
    public User signUp(SignupRequest request) {
        HouseholdInvite invite = lockedLiveInvite(request.inviteToken());
        AccountService.checkPassword(request.password());

        String username = accountService.usernameFromEmail(request.email());
        User user = User.builder()
                .username(username)
                .displayName(AuthService.displayNameOr(request.displayName(), username))
                .lastHouseholdId(invite.getHousehold().getId())
                .build();
        accountService.claimEmail(user, request.email());
        user.setPasswordHash(accountService.encodePassword(request.password()));
        try {
            user = accountService.saveClaimingEmail(user);
        } catch (DataIntegrityViolationException e) {
            // Not the email (that is a 409 already): two people whose addresses start the same
            // way signing up in the same instant, both given the one free username. Rare enough
            // that asking the loser to press the button again beats a retry loop here — the
            // transaction is spoiled once the insert has failed.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Somebody else was signing up at the same moment. Try again.");
        }

        join(invite, user, false);
        return user;
    }

    private void join(HouseholdInvite invite, User user, boolean broughtOwnAccount) {
        memberRepository.save(HouseholdMember.builder()
                .household(invite.getHousehold())
                .user(user)
                .role(HouseholdRole.MEMBER)
                .broughtOwnAccount(broughtOwnAccount ? true : null)
                .build());
        invite.setUseCount(invite.getUseCount() + 1);
    }

    /**
     * The link, read only once its house is locked — for anything that is about to let somebody
     * in. Throwing a link away (Make a new link, or removing somebody) takes the same lock, so
     * this either goes first, or waits and then reads the link as dead. Reading the link before
     * locking would let a join that was already waiting go ahead on a link that had just been
     * thrown away, putting back a person the owner had just taken out.
     */
    private HouseholdInvite lockedLiveInvite(String token) {
        UUID householdId = inviteRepository.findHouseholdIdByToken(clean(token))
                .orElseThrow(InviteService::notOurs);
        householdRepository.lockById(householdId);
        return liveInvite(token);
    }

    /** 404 for a token that was never ours, 410 for one that was and is not any more. */
    private HouseholdInvite liveInvite(String token) {
        HouseholdInvite invite = inviteRepository.findByToken(clean(token))
                .orElseThrow(InviteService::notOurs);
        if (!invite.isLive(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.GONE,
                    "This invite link has run out or been replaced. Ask for a new one.");
        }
        return invite;
    }

    private static String clean(String token) {
        return token == null ? "" : token.trim();
    }

    private static ResponseStatusException notOurs() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND,
                "That invite link isn't one of ours. Check you have all of it.");
    }
}
