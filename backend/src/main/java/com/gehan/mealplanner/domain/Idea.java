package com.gehan.mealplanner.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Somebody's idea for the app, on the ideas board everyone signed in can see and upvote. The
 * board is for the beta (app.ideas.enabled) and belongs to the whole app rather than to a
 * household: the idea is about the app, and whoever has one should hear what the others think.
 */
@Entity
@Table(name = "ideas")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Idea {

    /** A headline, not an essay; the details are for the rest. */
    public static final int MAX_TITLE = 80;
    public static final int MAX_DETAILS = 1000;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /**
     * Who suggested it. Null once that account has been deleted: the idea stays, shown as
     * Someone's, because the votes on it are other people's and they still want it.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id")
    private User author;

    @Column(nullable = false, length = MAX_TITLE)
    private String title;

    /** Null when there is nothing more to say than the title. */
    @Column(length = MAX_DETAILS)
    private String details;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private IdeaStatus status = IdeaStatus.OPEN;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    /** Moved on by an edit or a change of status, not by a vote. */
    @Column(nullable = false)
    private Instant updatedAt;
}
