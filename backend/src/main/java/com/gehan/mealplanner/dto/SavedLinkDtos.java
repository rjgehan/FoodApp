package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.SavedLink;
import com.gehan.mealplanner.domain.SavedLinkSource;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public class SavedLinkDtos {

    /**
     * Keeps a link. Only the url is needed: the server reads the page for a name and a picture,
     * and names it after the site when the page will not say. A name or a picture sent along —
     * from an import that already read the page — is used instead of reading it again.
     */
    public record CreateSavedLinkRequest(
            @NotBlank @Size(max = 4000) String url,
            @Size(max = SavedLink.MAX_NAME) String name,
            RecipeSection section,
            /** Just me. Null means shared with the household, which is the default. */
            Boolean personal,
            UUID coverImageId) {
    }

    /** Null leaves a field alone. `clearSection: true` takes it out of its drawer. */
    public record UpdateSavedLinkRequest(
            @Size(max = SavedLink.MAX_NAME) String name,
            RecipeSection section,
            Boolean clearSection,
            Boolean personal) {
    }

    public record SavedLinkResponse(
            UUID id,
            String url,
            String name,
            SavedLinkSource source,
            UUID coverImageId,
            RecipeSection section,
            boolean personal,
            /** Whether the person asking saved it — the only one who can make it "just me". */
            boolean mine,
            /** Who saved it; null once their account is gone. */
            String savedByName,
            Instant createdAt,
            /**
             * Only on a save: the link was already in the list, so that one was updated rather
             * than a second made. False everywhere else.
             */
            boolean alreadySaved,
            /**
             * Whether the person asking may delete it: whoever saved it, or anyone once they have
             * gone. Older apps ignore it and find out from the 403.
             */
            boolean canDelete) {
    }
}
