package com.gehan.mealplanner.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * A recipe added to the grocery list while its things are still waiting there from the last
 * time — more often a second tap than a second lasagne. Answered with a flag as well as the
 * sentence, so the app can ask "add it again?" and send `again` if so, instead of only saying no.
 */
public class AlreadyOnListException extends ResponseStatusException {

    public AlreadyOnListException(String recipeName) {
        super(HttpStatus.CONFLICT, "“" + recipeName + "” is already on the list.");
    }
}
