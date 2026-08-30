package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.StoredImage;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.StoredImageRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.Set;
import java.util.UUID;

@Service
public class ImageService {

    /**
     * The browser downscales before uploading, so anything approaching this cap means the
     * client-side resize did not run — reject it rather than quietly bloating the database.
     */
    private static final int MAX_BYTES = 3 * 1024 * 1024;

    private static final Set<String> ALLOWED = Set.of("image/jpeg", "image/png", "image/webp");

    private final StoredImageRepository imageRepository;
    private final HouseholdRepository householdRepository;
    private final HouseholdService householdService;

    public ImageService(StoredImageRepository imageRepository,
                         HouseholdRepository householdRepository,
                         HouseholdService householdService) {
        this.imageRepository = imageRepository;
        this.householdRepository = householdRepository;
        this.householdService = householdService;
    }

    @Transactional
    public StoredImage upload(UUID householdId, UUID requesterId, MultipartFile file) {
        householdService.assertMember(householdId, requesterId);
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));

        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No image was sent");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED.contains(contentType.toLowerCase())) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "That file type isn't supported — use a JPEG, PNG or WebP.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "That image is too large.");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read that image");
        }

        return imageRepository.save(StoredImage.builder()
                .household(household)
                .contentType(contentType.toLowerCase())
                .byteSize(bytes.length)
                .data(bytes)
                .build());
    }

    @Transactional(readOnly = true)
    public StoredImage get(UUID imageId) {
        return imageRepository.findById(imageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Image not found"));
    }

    @Transactional
    public void delete(UUID imageId, UUID requesterId) {
        StoredImage image = get(imageId);
        householdService.assertMember(image.getHousehold().getId(), requesterId);
        imageRepository.delete(image);
    }
}
