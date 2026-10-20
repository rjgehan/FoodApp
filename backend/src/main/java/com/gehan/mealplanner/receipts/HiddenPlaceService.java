package com.gehan.mealplanner.receipts;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.receipts.ReceiptDtos.HiddenPlaceResponse;
import com.gehan.mealplanner.receipts.ReceiptDtos.HidePlaceRequest;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.service.HouseholdService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * The places a household has taken off its store map ({@link HiddenPlace}): which they are, hiding
 * one, and showing one again. Any member of the household; nobody else.
 */
@Service
public class HiddenPlaceService {

    /** The same place found twice is within this of itself: Apple's pins do not wander further. */
    private static final double SAME_PLACE_METRES = 40;

    private final HiddenPlaceRepository hiddenPlaceRepository;
    private final HouseholdRepository householdRepository;
    private final HouseholdService householdService;

    public HiddenPlaceService(HiddenPlaceRepository hiddenPlaceRepository,
                              HouseholdRepository householdRepository,
                              HouseholdService householdService) {
        this.hiddenPlaceRepository = hiddenPlaceRepository;
        this.householdRepository = householdRepository;
        this.householdService = householdService;
    }

    /** Lately hidden first. */
    @Transactional(readOnly = true)
    public List<HiddenPlaceResponse> list(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return hiddenPlaceRepository.findByHouseholdIdOrderByHiddenAtDesc(householdId).stream()
                .map(HiddenPlaceService::toResponse)
                .toList();
    }

    /**
     * Off the map for the whole household. Hiding one already hidden (from another phone, or a
     * double tap) gives back the one there is rather than a second.
     */
    @Transactional
    public HiddenPlaceResponse hide(UUID householdId, UUID requesterId, HidePlaceRequest request) {
        householdService.assertMember(householdId, requesterId);
        Household household = householdRepository.lockById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
        String name = Stores.tidy(request.name());
        if (name == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Say which place to hide.");
        }
        for (HiddenPlace hidden : hiddenPlaceRepository.findByHouseholdIdOrderByHiddenAtDesc(householdId)) {
            if (hidden.getName().equalsIgnoreCase(name)
                    && metres(hidden.getLatitude(), hidden.getLongitude(), request.latitude(), request.longitude())
                    < SAME_PLACE_METRES) {
                return toResponse(hidden);
            }
        }
        HiddenPlace hidden = hiddenPlaceRepository.save(HiddenPlace.builder()
                .household(household)
                .name(name)
                .address(Stores.tidy(request.address()))
                .latitude(request.latitude())
                .longitude(request.longitude())
                .build());
        return toResponse(hidden);
    }

    /** Back on the map. One already shown again is not an error: it is back either way. */
    @Transactional
    public void show(UUID householdId, UUID hiddenId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        hiddenPlaceRepository.findByIdAndHouseholdId(hiddenId, householdId).ifPresent(hiddenPlaceRepository::delete);
    }

    private static HiddenPlaceResponse toResponse(HiddenPlace hidden) {
        return new HiddenPlaceResponse(hidden.getId(), hidden.getName(), hidden.getAddress(),
                hidden.getLatitude(), hidden.getLongitude(), hidden.getHiddenAt());
    }

    /** As the crow flies, near enough for a few dozen metres. */
    static double metres(double lat1, double lon1, double lat2, double lon2) {
        double north = Math.toRadians(lat2 - lat1) * 6_371_000;
        double east = Math.toRadians(lon2 - lon1) * 6_371_000 * Math.cos(Math.toRadians((lat1 + lat2) / 2));
        return Math.hypot(north, east);
    }
}
