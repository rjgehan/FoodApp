package com.gehan.mealplanner.web;

import com.gehan.mealplanner.service.BarcodeLookup;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Reading the barcode happens on the phone; asking what it means happens here.
 *
 * Here rather than in the browser for three reasons: the answer can be cached for the whole
 * household instead of per device, the catalogue sees one polite caller instead of every
 * phone in the house, and the iOS app gets the same endpoint for free.
 *
 * Not household-scoped — a barcode means the same thing everywhere — but signed in all the
 * same, because an open lookup endpoint is an open proxy.
 */
@RestController
@RequestMapping("/api/barcodes")
public class BarcodeController {

    private final BarcodeLookup lookup;

    public BarcodeController(BarcodeLookup lookup) {
        this.lookup = lookup;
    }

    @GetMapping("/{barcode}")
    public BarcodeLookup.Product find(@PathVariable String barcode) {
        return lookup.find(barcode).orElseThrow(() -> new ResponseStatusException(
                HttpStatus.NOT_FOUND, "Nothing in the catalogue has that barcode."));
    }
}
