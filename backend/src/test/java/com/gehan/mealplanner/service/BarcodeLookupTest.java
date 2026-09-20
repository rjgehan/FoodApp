package com.gehan.mealplanner.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * What a scanned barcode should be called once it is in the cupboard.
 *
 * Every JSON body below is the shape Open Food Facts really answers with — the awkward ones
 * were picked by scanning real products: a brand that is already the product's name, a brand
 * that is only part of it, and records the catalogue holds but has never had a name filled in.
 *
 * Only the reading is tested. Whether the catalogue is reachable is not this class's problem,
 * and a test that phones a charity's servers is a test that fails on a train.
 */
class BarcodeLookupTest {

    private final BarcodeLookup lookup = new BarcodeLookup(null);

    @Test
    void putsTheBrandOnTheFrontWhenTheNameDoesNotAlreadyCarryIt() {
        assertThat(name("{\"status\":1,\"product\":{\"product_name\":\"Baked Beans\",\"brands\":\"Heinz\"}}"))
                .isEqualTo("Heinz Baked Beans");
    }

    @Test
    void doesNotSayTheBrandTwice() {
        // Nutella's brands field is "Nutella, Ferrero" and its name is "Nutella".
        assertThat(name("{\"status\":1,\"product\":{\"product_name\":\"Nutella\",\"brands\":\"Nutella, Ferrero\"}}"))
                .isEqualTo("Nutella");
        // And the brand can be buried in the middle: "Coke" inside "Diet Coke Soft Drink".
        assertThat(name("{\"status\":1,\"product\":{\"product_name\":\"Diet Coke Soft Drink\",\"brands\":\"Coke\"}}"))
                .isEqualTo("Diet Coke Soft Drink");
    }

    @Test
    void prefersEnglishWhereTheCatalogueHasIt() {
        assertThat(name("{\"status\":1,\"product\":{\"product_name\":\"Haricots verts\","
                + "\"product_name_en\":\"Green Beans\",\"brands\":\"Bonduelle\"}}"))
                .isEqualTo("Bonduelle Green Beans");
    }

    @Test
    void fallsBackToTheGenericNameRatherThanGivingUp() {
        assertThat(name("{\"status\":1,\"product\":{\"product_name\":\"\",\"generic_name\":\"Semi skimmed milk\"}}"))
                .isEqualTo("Semi skimmed milk");
    }

    @Test
    void keepsTheSizeSeparateFromTheName() {
        BarcodeLookup.Product found = lookup.productFrom("5060335635808",
                "{\"status\":1,\"product\":{\"product_name\":\"Monster Ultra White\","
                        + "\"brands\":\"Monster Energy\",\"quantity\":\"500 ml\"}}");
        assertThat(found.name()).isEqualTo("Monster Ultra White");
        assertThat(found.size()).isEqualTo("500 ml");
    }

    @Test
    void dropsTheEuropeanEstimateMarkFromTheSize() {
        // Nutella really does come back as "400 g e".
        BarcodeLookup.Product found = lookup.productFrom("3017620422003",
                "{\"status\":1,\"product\":{\"product_name\":\"Nutella\",\"quantity\":\"400 g e\"}}");
        assertThat(found.size()).isEqualTo("400 g");
    }

    @Test
    void nothingComesBackForARecordWithNoName() {
        // The catalogue holds plenty of these: a barcode somebody scanned and never filled in.
        assertThat(lookup.productFrom("1234567890123", "{\"status\":1,\"product\":{\"brands\":\"Tesco\"}}")).isNull();
        assertThat(lookup.productFrom("1234567890123", "{\"status\":0}")).isNull();
        assertThat(lookup.productFrom("1234567890123", "not json at all")).isNull();
    }

    @Test
    void refusesAnythingThatIsNotAPlausibleBarcode() {
        // Malformed input never reaches the network, so a null cache is never touched.
        assertThat(lookup.find("")).isEmpty();
        assertThat(lookup.find("12345")).isEmpty();
        assertThat(lookup.find("../../etc/passwd")).isEmpty();
        assertThat(lookup.find("3017620422003 OR 1=1")).isEmpty();
    }

    private String name(String body) {
        BarcodeLookup.Product found = lookup.productFrom("3017620422003", body);
        assertThat(found).isNotNull();
        return found.name();
    }
}
