package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.Place;
import com.gehan.mealplanner.domain.StoredImage;
import com.gehan.mealplanner.dto.PlaceDtos.PlaceRequest;
import com.gehan.mealplanner.dto.PlaceDtos.PlaceResponse;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.MealPlanEntryRepository;
import com.gehan.mealplanner.repository.PlaceRepository;
import com.gehan.mealplanner.repository.StoredImageRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.UUID;

@Service
public class PlaceService {

    private final PlaceRepository placeRepository;
    private final MealPlanEntryRepository mealPlanEntryRepository;
    private final HouseholdRepository householdRepository;
    private final StoredImageRepository imageRepository;
    private final HouseholdService householdService;

    public PlaceService(PlaceRepository placeRepository,
                        MealPlanEntryRepository mealPlanEntryRepository,
                        HouseholdRepository householdRepository,
                        StoredImageRepository imageRepository,
                        HouseholdService householdService) {
        this.placeRepository = placeRepository;
        this.mealPlanEntryRepository = mealPlanEntryRepository;
        this.householdRepository = householdRepository;
        this.imageRepository = imageRepository;
        this.householdService = householdService;
    }

    @Transactional(readOnly = true)
    public List<PlaceResponse> list(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return placeRepository.findByHouseholdIdOrderByNameAsc(householdId).stream().map(this::toResponse).toList();
    }

    /**
     * Creates the place, or returns the one already called that. Typing "pizza" into the picker
     * twice should not leave two pizzas in the list.
     */
    @Transactional
    public PlaceResponse createOrGet(UUID householdId, UUID requesterId, PlaceRequest request) {
        householdService.assertMember(householdId, requesterId);
        String name = request.name().trim();

        return placeRepository.findByHouseholdIdAndNameIgnoreCase(householdId, name)
                .map(this::toResponse)
                .orElseGet(() -> {
                    Household household = householdRepository.findById(householdId)
                            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
                    return toResponse(placeRepository.save(Place.builder()
                            .household(household)
                            .name(name)
                            .menuUrl(normalizeLink(request.menuUrl()))
                            .phone(blankToNull(request.phone()))
                            .notes(blankToNull(request.notes()))
                            .image(image(request.imageId(), householdId))
                            .build()));
                });
    }

    @Transactional
    public PlaceResponse update(UUID placeId, UUID requesterId, PlaceRequest request) {
        Place place = owned(placeId, requesterId);
        place.setName(request.name().trim());
        place.setMenuUrl(normalizeLink(request.menuUrl()));
        place.setPhone(blankToNull(request.phone()));
        place.setNotes(blankToNull(request.notes()));
        place.setImage(image(request.imageId(), place.getHousehold().getId()));
        return toResponse(placeRepository.save(place));
    }

    /**
     * Meal plan entries point at a place, so deleting one would orphan them. The planned nights
     * go with it — a slot naming a restaurant you no longer keep is not worth preserving, and a
     * row with neither recipe nor place would be invisible in the UI but still in the database.
     */
    @Transactional
    public void delete(UUID placeId, UUID requesterId) {
        Place place = owned(placeId, requesterId);
        mealPlanEntryRepository.deleteByPlaceId(placeId);
        placeRepository.delete(place);
    }

    private Place owned(UUID placeId, UUID requesterId) {
        Place place = placeRepository.findById(placeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Place not found"));
        householdService.assertMember(place.getHousehold().getId(), requesterId);
        return place;
    }

    private StoredImage image(UUID imageId, UUID householdId) {
        if (imageId == null) {
            return null;
        }
        StoredImage stored = imageRepository.findById(imageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Image not found"));
        if (!stored.getHousehold().getId().equals(householdId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "That image belongs to another household");
        }
        return stored;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** Same rule as recipe video links: this becomes an href, so only http(s) gets through. */
    private static String normalizeLink(String raw) {
        String trimmed = blankToNull(raw);
        if (trimmed == null) {
            return null;
        }
        try {
            String scheme = new URI(trimmed).getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Links must start with http:// or https://");
            }
        } catch (URISyntaxException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That doesn't look like a link.");
        }
        return trimmed;
    }

    private PlaceResponse toResponse(Place place) {
        return new PlaceResponse(
                place.getId(), place.getName(), place.getMenuUrl(), place.getPhone(), place.getNotes(),
                place.getImage() == null ? null : place.getImage().getId());
    }
}
