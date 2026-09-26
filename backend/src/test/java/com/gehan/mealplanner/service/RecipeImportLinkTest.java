package com.gehan.mealplanner.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** What "From a link" makes of what people actually paste into it. */
class RecipeImportLinkTest {

    @Test
    void takesALinkAsItIs() {
        assertThat(RecipeImportService.linkIn("  https://www.tiktok.com/@cook/video/1  "))
                .isEqualTo("https://www.tiktok.com/@cook/video/1");
    }

    @Test
    void findsTheLinkInAShareSheetsSentence() {
        assertThat(RecipeImportService.linkIn("Check out this recipe! https://vm.tiktok.com/ZM123/ #dinner"))
                .isEqualTo("https://vm.tiktok.com/ZM123/");
        assertThat(RecipeImportService.linkIn("Try this (https://example.com/soup)."))
                .isEqualTo("https://example.com/soup");
    }

    @Test
    void keepsTheEndOfALinkPastedOnItsOwn() {
        assertThat(RecipeImportService.linkIn("https://en.wikipedia.org/wiki/Pasta_(food)"))
                .isEqualTo("https://en.wikipedia.org/wiki/Pasta_(food)");
        assertThat(RecipeImportService.linkIn("https://site.example/recipe/best-soup!"))
                .isEqualTo("https://site.example/recipe/best-soup!");
        assertThat(RecipeImportService.linkIn("See https://en.wikipedia.org/wiki/Pasta_(food)."))
                .isEqualTo("https://en.wikipedia.org/wiki/Pasta_(food)");
    }

    @Test
    void addsHttpsToAnAddressTypedWithoutIt() {
        assertThat(RecipeImportService.linkIn("instagram.com/reel/abc")).isEqualTo("https://instagram.com/reel/abc");
    }

    @Test
    void leavesAnythingElseForTheRefusal() {
        assertThat(RecipeImportService.linkIn("javascript:alert(1)")).isEqualTo("javascript:alert(1)");
        assertThat(RecipeImportService.linkIn("chicken soup")).isEqualTo("chicken soup");
        assertThat(RecipeImportService.linkIn(null)).isEmpty();
    }
}
