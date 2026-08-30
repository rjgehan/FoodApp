package com.gehan.mealplanner.web;

import com.gehan.mealplanner.domain.StoredImage;
import com.gehan.mealplanner.service.ImageService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

@RestController
public class ImageController {

    private final ImageService imageService;

    public ImageController(ImageService imageService) {
        this.imageService = imageService;
    }

    @PostMapping(value = "/api/households/{householdId}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> upload(@AuthenticationPrincipal UUID userId,
                                       @PathVariable UUID householdId,
                                       @RequestPart("file") MultipartFile file) {
        StoredImage saved = imageService.upload(householdId, userId, file);
        return Map.of("id", saved.getId(), "byteSize", saved.getByteSize());
    }

    /**
     * Deliberately unauthenticated: an <img> tag cannot send a bearer token, and the id is a
     * random UUID, so the URL works like an unlisted link. Fine for a private family app;
     * revisit if this is ever exposed to the open internet.
     */
    @GetMapping("/api/images/{imageId}")
    public ResponseEntity<byte[]> get(@PathVariable UUID imageId) {
        StoredImage image = imageService.get(imageId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(image.getContentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .body(image.getData());
    }

    @DeleteMapping("/api/images/{imageId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UUID userId, @PathVariable UUID imageId) {
        imageService.delete(imageId, userId);
        return ResponseEntity.noContent().build();
    }
}
