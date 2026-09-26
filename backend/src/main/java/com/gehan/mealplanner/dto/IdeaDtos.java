package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.domain.Idea;
import com.gehan.mealplanner.domain.IdeaStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public class IdeaDtos {

    /** A new idea, or your own one reworded. Details are optional. */
    public record IdeaRequest(
            @NotBlank(message = "Give your idea a title.")
            @Size(max = Idea.MAX_TITLE, message = "Keep the title to 80 characters. The details can say the rest.")
            String title,
            @Size(max = Idea.MAX_DETAILS, message = "Keep the details to 1000 characters.")
            String details) {
    }

    /** The admin moving an idea on: planned, done, or not doing it after all. */
    public record IdeaStatusRequest(@NotNull(message = "Pick a status.") IdeaStatus status) {
    }

    /**
     * One card on the board, as the person asking sees it. `authorName` is "Someone" once the
     * account behind it has been deleted; `mine` is what shows Edit and Delete.
     */
    public record IdeaResponse(
            UUID id, String title, String details, IdeaStatus status,
            String authorName, boolean mine,
            long voteCount, boolean votedByMe,
            Instant createdAt, Instant updatedAt) {
    }
}
