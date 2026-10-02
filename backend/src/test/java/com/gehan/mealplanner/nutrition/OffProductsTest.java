package com.gehan.mealplanner.nutrition;

import com.gehan.mealplanner.service.BarcodeLookup;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/**
 * Reading Open Food Facts' answers. The bodies are trimmed real ones (Nutella; a Greek yogurt
 * with a serving size; Search-a-licious hits, whose brands are a list). Nothing here phones out.
 */
class OffProductsTest {

    static final String NUTELLA = """
            {"code":"3017620422003","status":1,"product":{"brands":"Nutella, Ferrero","product_name":"Nutella",
             "quantity":"400 g e","product_quantity":400,"product_quantity_unit":"g","nova_group":4,
             "nutriscore_grade":"e","nutriments":{"energy-kcal_100g":539,"energy-kj_100g":2252,"fat_100g":30.9,
             "saturated-fat_100g":10.6,"carbohydrates_100g":57.5,"sugars_100g":56.3,"fiber_100g":0,
             "proteins_100g":6.3,"salt_100g":0.107,"sodium_100g":0.0428}}}
            """;

    static final String YOGURT = """
            {"code":"5000000000001","status":1,"product":{"brands":"Dairy Co","product_name":"Greek yogurt 0%",
             "quantity":"500g","product_quantity":"500","product_quantity_unit":"g","serving_size":"170 g",
             "serving_quantity":"170","nutriments":{"energy_100g":238,"fat_100g":0.4,"saturated-fat_100g":0.1,
             "carbohydrates_100g":3.5,"sugars_100g":3.5,"proteins_100g":10,"salt_100g":0.1,
             "calcium_100g":0.08,"vitamin-b12_100g":0.00000045}}}
            """;

    private final AtomicInteger calls = new AtomicInteger();

    private OffProducts offline(String body) {
        return new OffProducts(null, new OffRateLimit(null, () -> 0L), new BarcodeLookup(null)) {
            @Override
            protected String fetch(URI uri, boolean product) {
                calls.incrementAndGet();
                return body;
            }
        };
    }

    @Test
    void readsTheLabelPer100gWithSodiumInMilligrams() {
        var p = offline(NUTELLA).product("3017620422003");
        assertThat(p.name()).isEqualTo("Nutella");
        assertThat(p.size()).isEqualTo("400 g");
        assertThat(p.packGrams()).isEqualTo(400);
        assertThat(p.per100g().kcal()).isEqualTo(539);
        assertThat(p.per100g().sodiumMg()).isEqualTo(43);
        assertThat(p.per100g().saltG()).isEqualTo(0.11);
        assertThat(p.nutriScore()).isEqualTo("e");
        assertThat(p.novaGroup()).isEqualTo(4);
        assertThat(p.perServing()).isNull();
        assertThat(p.attribution().text()).isEqualTo("Data from Open Food Facts (ODbL)");
        assertThat(p.attribution().url()).endsWith("/product/3017620422003");
    }

    @Test
    void worksOutKcalFromKilojoulesAndAServingFromItsWeight() {
        var p = offline(YOGURT).product("5000000000001");
        assertThat(p.per100g().kcal()).isCloseTo(57, within(0.5));
        assertThat(p.servingGrams()).isEqualTo(170);
        assertThat(p.perServing().protein()).isEqualTo(17);
        assertThat(p.perServing().kcal()).isCloseTo(97, within(0.5));
        assertThat(p.badges()).extracting(NutritionDtos.Badge::label).contains("High protein", "Fat free");
        assertThat(p.details()).extracting(NutritionDtos.Detail::label).contains("Calcium", "Vitamin B12");
        assertThat(p.details().stream().filter(d -> d.key().equals("calcium")).findFirst().orElseThrow().percentDaily())
                .isEqualTo(10);
        assertThat(p.details().stream().filter(d -> d.key().equals("vitaminB12")).findFirst().orElseThrow().percentDaily())
                .isEqualTo(18);
    }

    @Test
    void anUnknownBarcodeIsA404AndANonsenseOneA400() {
        assertThatThrownBy(() -> offline("{\"status\":0}").product("4000000000000"))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
        assertThatThrownBy(() -> offline(NUTELLA).product("12ab"))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("400");
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void theCatalogueBeingDownIsA503NotAMiss() {
        assertThatThrownBy(() -> offline(null).product("4000000000000"))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("503");
    }

    @Test
    void stopsAskingOnceThisMinutesAllowanceIsUsed() {
        OffProducts off = offline(NUTELLA);
        for (int i = 0; i < OffRateLimit.PRODUCTS_PER_MINUTE; i++) off.product("3017620422003");
        assertThatThrownBy(() -> off.product("3017620422003"))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("429");
        assertThat(calls.get()).isEqualTo(OffRateLimit.PRODUCTS_PER_MINUTE);
    }

    @Test
    void readsSearchHitsWhoseBrandsAreAList() {
        var hits = offline(null).hits("""
                {"hits":[{"code":"0894700010137","brands":["Chobani"],"quantity":"32 OZ",
                  "nutriments":{"energy-kcal_100g":52.9,"proteins_100g":9.41},"product_name":"Nonfat Greek Yogurt"},
                 {"code":"bad","product_name":"No barcode"},
                 {"code":"9310653103609","brands":["Chobani"],"product_name":""}]}
                """);
        assertThat(hits).hasSize(1);
        assertThat(hits.get(0).brand()).isEqualTo("Chobani");
        assertThat(hits.get(0).kcal()).isEqualTo(53);
        assertThat(hits.get(0).protein()).isEqualTo(9.4);
    }

    @Test
    void aShortSearchIsNotSent() {
        var search = offline("{}").search("eg");
        assertThat(search.status()).isEqualTo("skipped");
        assertThat(calls.get()).isZero();
    }
}
