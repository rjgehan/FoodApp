package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.HouseholdMember;
import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.RecipeCategory;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.AddMemberRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateUserRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.HouseholdResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.MemberResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.UpdateHouseholdSettingsRequest;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.RecipeCategoryRepository;
import com.gehan.mealplanner.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
public class HouseholdService {

    private final HouseholdRepository householdRepository;
    private final HouseholdMemberRepository memberRepository;
    private final UserRepository userRepository;
    private final RecipeCategoryRepository categoryRepository;

    public HouseholdService(HouseholdRepository householdRepository,
                             HouseholdMemberRepository memberRepository,
                             UserRepository userRepository,
                             RecipeCategoryRepository categoryRepository) {
        this.householdRepository = householdRepository;
        this.memberRepository = memberRepository;
        this.userRepository = userRepository;
        this.categoryRepository = categoryRepository;
    }

    /** Starting sub-categories, so a new household's catalog is never blank at the second level. */
    private static final List<String> DEFAULT_CATEGORIES = List.of("Main dish", "Side", "Veggie", "Full meal");

    public HouseholdResponse create(UUID ownerId, CreateHouseholdRequest request) {
        User owner = userRepository.findById(ownerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        Household household = householdRepository.save(Household.builder().name(request.name()).build());
        memberRepository.save(HouseholdMember.builder()
                .household(household)
                .user(owner)
                .role(HouseholdRole.OWNER)
                .build());

        DEFAULT_CATEGORIES.forEach(name -> categoryRepository.save(
                RecipeCategory.builder().household(household).name(name).build()));

        return toResponse(household, HouseholdRole.OWNER);
    }

    @Transactional(readOnly = true)
    public List<HouseholdResponse> listForUser(UUID userId) {
        return memberRepository.findByUserId(userId).stream()
                .map(m -> toResponse(m.getHousehold(), m.getRole()))
                .toList();
    }

    @Transactional
    public HouseholdResponse updateSettings(UUID householdId, UUID requesterId, UpdateHouseholdSettingsRequest request) {
        assertMember(householdId, requesterId);
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
        household.setDefaultServings(request.defaultServings());
        household.setPlanningHorizonDays(request.planningHorizonDays());
        return toResponse(householdRepository.save(household), roleOf(householdId, requesterId));
    }

    /**
     * Renaming is owner-only, unlike the other settings. The name is how everyone else in the
     * app finds this household — on the login screen, in the share list — so changing it is not
     * the same kind of act as changing your own default serving size.
     */
    @Transactional
    public HouseholdResponse rename(UUID householdId, UUID requesterId, String name) {
        assertOwner(householdId, requesterId);
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
        household.setName(name.trim());
        return toResponse(householdRepository.save(household), HouseholdRole.OWNER);
    }

    private HouseholdResponse toResponse(Household household, HouseholdRole role) {
        return new HouseholdResponse(
                household.getId(), household.getName(), household.getDefaultServings(),
                household.getPlanningHorizonDays(), role);
    }

    @Transactional(readOnly = true)
    public List<MemberResponse> listMembers(UUID householdId, UUID requesterId) {
        assertMember(householdId, requesterId);
        return memberRepository.findByHouseholdId(householdId).stream()
                .map(m -> toMemberResponse(m.getUser(), m.getRole()))
                .toList();
    }

    public MemberResponse addMember(UUID householdId, UUID requesterId, AddMemberRequest request) {
        assertMember(householdId, requesterId);

        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
        User newMember = userRepository.findByUsername(request.username())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No user with that username"));

        if (memberRepository.existsByHouseholdIdAndUserId(householdId, newMember.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "User is already a member");
        }

        HouseholdMember member = memberRepository.save(HouseholdMember.builder()
                .household(household)
                .user(newMember)
                .role(HouseholdRole.MEMBER)
                .build());

        return toMemberResponse(newMember, member.getRole());
    }

    /**
     * Makes an account for someone who does not have one yet and drops them straight into this
     * household. Any member can do this for any household they belong to — there is no separate
     * sign-up, so this is how everyone but the very first person gets an account. The new account
     * has no PIN; its owner picks one the first time they sign in.
     */
    @Transactional
    public MemberResponse createUser(UUID householdId, UUID requesterId, CreateUserRequest request) {
        assertMember(householdId, requesterId);

        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));

        String username = request.username().trim();
        if (userRepository.existsByUsername(username)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Someone already uses that name — invite them instead.");
        }

        User user = userRepository.save(User.builder()
                .username(username)
                .displayName(AuthService.displayNameOr(request.displayName(), username))
                .build());

        HouseholdMember member = memberRepository.save(HouseholdMember.builder()
                .household(household)
                .user(user)
                .role(HouseholdRole.MEMBER)
                .build());

        return toMemberResponse(user, member.getRole());
    }

    private MemberResponse toMemberResponse(User user, HouseholdRole role) {
        return new MemberResponse(user.getId(), user.getUsername(), user.getDisplayName(),
                role, user.getPinHash() != null);
    }

    public void assertMember(UUID householdId, UUID userId) {
        if (!memberRepository.existsByHouseholdIdAndUserId(householdId, userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not a member of this household");
        }
    }

    /** The first enforcement of HouseholdRole in the app — everywhere else, members are equal. */
    public void assertOwner(UUID householdId, UUID userId) {
        if (roleOf(householdId, userId) != HouseholdRole.OWNER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the household owner can do that");
        }
    }

    private HouseholdRole roleOf(UUID householdId, UUID userId) {
        return memberRepository.findByHouseholdIdAndUserId(householdId, userId)
                .map(HouseholdMember::getRole)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.FORBIDDEN, "Not a member of this household"));
    }
}
