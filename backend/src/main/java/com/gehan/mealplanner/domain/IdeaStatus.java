package com.gehan.mealplanner.domain;

/**
 * Where an idea on the board has got to. Everything starts OPEN; only the admin moves it on,
 * so a badge saying Planned means the person who builds the app said so.
 */
public enum IdeaStatus {
    OPEN,
    PLANNED,
    DONE,
    NOT_DOING;

    /** Done, or decided against: still on the board, but no longer asking for votes. */
    public boolean isSettled() {
        return this == DONE || this == NOT_DOING;
    }
}
