package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.HouseholdMember;
import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.AddMemberRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.HouseholdResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.MemberResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.UpdateHouseholdSettingsRequest;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
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

    public HouseholdService(HouseholdRepository householdRepository,
                             HouseholdMemberRepository memberRepository,
                             UserRepository userRepository) {
        this.householdRepository = householdRepository;
        this.memberRepository = memberRepository;
        this.userRepository = userRepository;
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

        return toResponse(household);
    }

    @Transactional(readOnly = true)
    public List<HouseholdResponse> listForUser(UUID userId) {
        return memberRepository.findByUserId(userId).stream()
                .map(HouseholdMember::getHousehold)
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public HouseholdResponse updateSettings(UUID householdId, UUID requesterId, UpdateHouseholdSettingsRequest request) {
        assertMember(householdId, requesterId);
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
        household.setDefaultServings(request.defaultServings());
        household.setDefaultRecipeVisibility(request.defaultRecipeVisibility());
        household.setPlanningHorizonDays(request.planningHorizonDays());
        return toResponse(householdRepository.save(household));
    }

    private HouseholdResponse toResponse(Household household) {
        return new HouseholdResponse(
                household.getId(), household.getName(), household.getDefaultServings(),
                household.getDefaultRecipeVisibility(), household.getPlanningHorizonDays());
    }

    @Transactional(readOnly = true)
    public List<MemberResponse> listMembers(UUID householdId, UUID requesterId) {
        assertMember(householdId, requesterId);
        return memberRepository.findByHouseholdId(householdId).stream()
                .map(m -> new MemberResponse(m.getUser().getId(), m.getUser().getUsername(),
                        m.getUser().getDisplayName(), m.getRole()))
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

        return new MemberResponse(newMember.getId(), newMember.getUsername(), newMember.getDisplayName(), member.getRole());
    }

    public void assertMember(UUID householdId, UUID userId) {
        if (!memberRepository.existsByHouseholdIdAndUserId(householdId, userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not a member of this household");
        }
    }
}
