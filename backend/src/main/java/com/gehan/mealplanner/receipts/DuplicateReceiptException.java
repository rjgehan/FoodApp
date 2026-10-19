package com.gehan.mealplanner.receipts;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/**
 * A receipt saved before, by its barcode — the same paper scanned twice. Carries which one, so
 * the phone can offer to open it, or save this one anyway without the barcode.
 */
public class DuplicateReceiptException extends ResponseStatusException {

    private final UUID duplicateOf;

    public DuplicateReceiptException(UUID duplicateOf) {
        super(HttpStatus.CONFLICT, "You've already saved this receipt.");
        this.duplicateOf = duplicateOf;
    }

    public UUID getDuplicateOf() {
        return duplicateOf;
    }
}
