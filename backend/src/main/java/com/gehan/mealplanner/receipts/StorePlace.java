package com.gehan.mealplanner.receipts;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Which branch of a shop: its name and address as Apple Maps gives them, and where it stands. Kept
 * on a receipt (where it was bought) and on the household's shop (the branch it was last linked
 * to), so the store map can pin a branch Apple's own search does not find.
 */
@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class StorePlace {

    @Column(name = "place_name", length = 120)
    private String name;

    @Column(name = "place_address", length = 200)
    private String address;

    @Column(name = "place_latitude")
    private Double latitude;

    @Column(name = "place_longitude")
    private Double longitude;

    /** Somewhere, as far as a map is concerned: a name alone pins nothing. */
    public boolean located() {
        return latitude != null && longitude != null;
    }
}
