package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.HouseholdInvite;
import com.gehan.mealplanner.domain.HouseholdMember;
import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.RecipeCategory;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.UpdateProfileRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.HouseholdResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.MemberResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.UpdateHouseholdSettingsRequest;
import com.gehan.mealplanner.repository.HouseholdInviteRepository;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.RecipeCategoryRepository;
import com.gehan.mealplanner.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
public class HouseholdService {

    private final HouseholdRepository householdRepository;
    private final HouseholdMemberRepository memberRepository;
    private final UserRepository userRepository;
    private final RecipeCategoryRepository categoryRepository;
    private final GroceryCategoryService groceryCategoryService;
    private final HouseholdInviteRepository inviteRepository;
    private final JdbcTemplate jdbc;

    public HouseholdService(HouseholdRepository householdRepository,
                             HouseholdMemberRepository memberRepository,
                             UserRepository userRepository,
                             RecipeCategoryRepository categoryRepository,
                             GroceryCategoryService groceryCategoryService,
                             HouseholdInviteRepository inviteRepository,
                             JdbcTemplate jdbc) {
        this.householdRepository = householdRepository;
        this.memberRepository = memberRepository;
        this.userRepository = userRepository;
        this.categoryRepository = categoryRepository;
        this.groceryCategoryService = groceryCategoryService;
        this.inviteRepository = inviteRepository;
        this.jdbc = jdbc;
    }


    public HouseholdResponse create(UUID ownerId, CreateHouseholdRequest request) {
        User owner = userRepository.findById(ownerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        Household household = householdRepository.save(Household.builder().name(request.name()).build());
        memberRepository.save(HouseholdMember.builder()
                .household(household)
                .user(owner)
                .role(HouseholdRole.OWNER)
                .build());

        RecipeService.seedDefaultGroups(household, categoryRepository);
        groceryCategoryService.seedDefaults(household);

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

    /** The household as this person sees it — their role in it included. */
    @Transactional(readOnly = true)
    public HouseholdResponse responseFor(UUID householdId, UUID userId) {
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
        return toResponse(household, roleOf(householdId, userId));
    }

    private HouseholdResponse toResponse(Household household, HouseholdRole role) {
        return new HouseholdResponse(
                household.getId(), household.getName(), household.getDefaultServings(),
                household.getPlanningHorizonDays(), role,
                memberRepository.findByHouseholdId(household.getId()).size());
    }

    @Transactional(readOnly = true)
    public List<MemberResponse> listMembers(UUID householdId, UUID requesterId) {
        assertMember(householdId, requesterId);
        return memberRepository.findByHouseholdId(householdId).stream()
                .map(m -> toMemberResponse(m.getUser(), m.getRole()))
                .toList();
    }

    private MemberResponse toMemberResponse(User user, HouseholdRole role) {
        return new MemberResponse(user.getId(), user.getUsername(), user.getDisplayName(),
                role, user.getPinHash() != null, user.getEmail() != null, user.getPasswordHash() != null);
    }

    /**
     * Leaves a household. Recipes, plans and places belong to the household rather than to a
     * person, so nothing of theirs disappears — only the membership row goes.
     */
    @Transactional
    public void leave(UUID householdId, UUID userId) {
        HouseholdMember leaving = memberRepository.findByHouseholdIdAndUserId(householdId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Not a member of this household"));

        List<HouseholdMember> remaining = memberRepository.findByHouseholdId(householdId).stream()
                .filter(m -> !m.getId().equals(leaving.getId()))
                .toList();

        // Nobody left means nobody can ever sign in again, and the recipes go with it. Deleting a
        // household should be a thing you choose, not a side effect of walking out.
        if (remaining.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "You're the only one here. Invite someone else first, or delete the household.");
        }

        // An ownerless household could never be renamed again, so the longest-standing member
        // inherits it rather than leaving everyone stuck.
        if (leaving.getRole() == HouseholdRole.OWNER) {
            remaining.stream()
                    .min(Comparator.comparing(HouseholdMember::getJoinedAt))
                    .ifPresent(m -> {
                        m.setRole(HouseholdRole.OWNER);
                        memberRepository.save(m);
                    });
        }

        memberRepository.delete(leaving);
    }

    /**
     * The owner takes somebody out of the house. The same as that person leaving — only their
     * membership row goes, and everything they added stays with the house — except that it is
     * the owner's choice, not theirs. Your own way out is Leave, which knows about handing the
     * house on; this refuses to be used on yourself rather than guess.
     *
     * The house's invite link goes with them. Everyone in a house can see its link, so the person
     * just taken out has it too — left alone, it would let them straight back in without asking
     * anybody, which would make removing them mean nothing. The next person to open the Invite
     * card gets a fresh one.
     *
     * Their phone finds out on its next request here, which answers 403 like any house they are
     * not in, and falls back to another house of theirs.
     */
    @Transactional
    public void removeMember(UUID householdId, UUID ownerId, UUID userId) {
        assertOwner(householdId, ownerId);
        if (ownerId.equals(userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "That's you. Use Leave to take yourself out of the household.");
        }
        HouseholdMember removing = memberRepository.findByHouseholdIdAndUserId(householdId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "They aren't in this household."));
        memberRepository.delete(removing);
        retireInvites(householdId);
    }

    /**
     * Stops every link into the house from working. Takes the household's lock first, as making
     * a link does, so a link being made at the same moment cannot slip out alive afterwards.
     */
    @Transactional
    public void retireInvites(UUID householdId) {
        householdRepository.lockById(householdId);
        Instant now = Instant.now();
        for (HouseholdInvite invite : inviteRepository.findByHouseholdIdAndRevokedAtIsNull(householdId)) {
            invite.setRevokedAt(now);
        }
    }

    /**
     * Deletes a household outright, with everything in it.
     *
     * The way out for the last person in: leaving is refused when nobody would be left, because
     * an empty household is a thing nobody can sign in to and nobody can delete. This is the
     * other door, and it is the irreversible one — every recipe, plan, list, photo and cupboard
     * item goes.
     *
     * It reaches past this household where it has to. A recipe published here and kept by
     * another house is still owned here, so the filings that put it on their shelf go too, and
     * so do any meals they had planned with it. There is no version of deleting a recipe that
     * leaves somebody else's plan pointing at it.
     *
     * Written as ordered SQL rather than left to JPA: none of the foreign keys cascade, several
     * of the tables are join tables with no entity of their own, and the ones that reach in from
     * another household are not mapped from this side at all. The order is the foreign-key graph
     * read backwards, children first. If a new table ever points at a household and is not added
     * here, this fails loudly on a constraint rather than quietly leaving debris.
     */
    @Transactional
    public void delete(UUID householdId, UUID requesterId) {
        HouseholdMember member = memberRepository.findByHouseholdIdAndUserId(householdId, requesterId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Not a member of this household"));

        // The owner, or whoever is the last one standing — after leave() hands ownership on,
        // those are normally the same person, but not on a household that predates that rule.
        boolean lastOneIn = memberRepository.findByHouseholdId(householdId).size() == 1;
        if (member.getRole() != HouseholdRole.OWNER && !lastOneIn) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only the owner can delete a household.");
        }

        String ours = " = ?";
        String recipesHere = "(SELECT id FROM recipes WHERE household_id = ?)";
        String placesHere = "(SELECT id FROM places WHERE household_id = ?)";

        // Meal plans, including other households' plans that named a recipe or place of ours.
        jdbc.update("DELETE FROM meal_plan_entry_included_optionals WHERE entry_id IN ("
                + "SELECT id FROM meal_plan_entries WHERE household_id" + ours
                + " OR recipe_id IN " + recipesHere + " OR place_id IN " + placesHere + ")",
                householdId, householdId, householdId);
        jdbc.update("DELETE FROM meal_plan_entries WHERE household_id" + ours
                + " OR recipe_id IN " + recipesHere + " OR place_id IN " + placesHere,
                householdId, householdId, householdId);

        // Where a recipe of ours sits on anybody's shelf, and the shelves themselves.
        jdbc.update("DELETE FROM recipe_filing_categories WHERE filing_id IN ("
                + "SELECT id FROM recipe_filings WHERE household_id" + ours
                + " OR recipe_id IN " + recipesHere + ")"
                + " OR category_id IN (SELECT id FROM recipe_categories WHERE household_id = ?)",
                householdId, householdId, householdId);
        jdbc.update("DELETE FROM recipe_filings WHERE household_id" + ours
                + " OR recipe_id IN " + recipesHere, householdId, householdId);
        jdbc.update("DELETE FROM recipe_shares WHERE household_id" + ours
                + " OR recipe_id IN " + recipesHere, householdId, householdId);

        // The recipes themselves, innards first.
        jdbc.update("DELETE FROM recipe_links WHERE recipe_id IN " + recipesHere, householdId);
        jdbc.update("DELETE FROM recipe_source_links WHERE recipe_id IN " + recipesHere, householdId);
        jdbc.update("DELETE FROM recipe_ingredients WHERE recipe_id IN " + recipesHere, householdId);
        jdbc.update("DELETE FROM recipe_photos WHERE recipe_id IN " + recipesHere, householdId);
        jdbc.update("DELETE FROM recipes WHERE household_id = ?", householdId);
        // Self-referencing through parent_id, but every row of the tree belongs to this
        // household, so one statement takes the parents and the children together.
        jdbc.update("DELETE FROM recipe_categories WHERE household_id = ?", householdId);

        // The kitchen: what is in it, what is on the list, and where the aisles are.
        jdbc.update("DELETE FROM cupboard_items WHERE household_id = ?", householdId);
        jdbc.update("DELETE FROM grocery_list_items WHERE household_id = ?", householdId);
        jdbc.update("DELETE FROM ingredient_sections WHERE household_id = ?", householdId);
        jdbc.update("DELETE FROM grocery_categories WHERE household_id = ?", householdId);
        jdbc.update("DELETE FROM section_icons WHERE household_id = ?", householdId);
        jdbc.update("DELETE FROM blacklisted_ingredients WHERE household_id = ?", householdId);

        // Places hold a picture, so they go before the pictures do.
        jdbc.update("DELETE FROM places WHERE household_id = ?", householdId);
        jdbc.update("DELETE FROM stored_images WHERE household_id = ?", householdId);

        jdbc.update("DELETE FROM household_invites WHERE household_id = ?", householdId);
        jdbc.update("DELETE FROM household_members WHERE household_id = ?", householdId);
        jdbc.update("DELETE FROM households WHERE id = ?", householdId);
    }

    /** Renames you. The username has to stay unique, since it is what you sign in with. */
    @Transactional
    public MemberResponse updateProfile(UUID userId, UpdateProfileRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        if (request.username() != null && !request.username().isBlank()) {
            String username = request.username().trim();
            if (!username.equalsIgnoreCase(user.getUsername()) && userRepository.existsByUsernameIgnoreCase(username)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Someone already uses that name.");
            }
            user.setUsername(username);
        }
        if (request.displayName() != null && !request.displayName().isBlank()) {
            user.setDisplayName(request.displayName().trim());
        }

        User saved = userRepository.save(user);
        return toMemberResponse(saved, null);
    }

    public boolean isMember(UUID householdId, UUID userId) {
        return memberRepository.existsByHouseholdIdAndUserId(householdId, userId);
    }

    public void assertMember(UUID householdId, UUID userId) {
        if (!isMember(householdId, userId)) {
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
