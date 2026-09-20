package com.gehan.mealplanner.service;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The same units, in all three places.
 *
 * An amount is parsed three times over — here for importing, in {@code web/src/utils/amount.ts}
 * for the web's add box, and in {@code ios/MealPlanner/Networking/Amount.swift} for the paste
 * flow — and all three write into the same catalog. Each file already says it has to agree with
 * the other two, which is a comment and therefore not enforced: they had quietly drifted by
 * eight units before this test existed, so "2 handfuls spinach" parsed on the phone and not on
 * the web.
 *
 * Nothing here can read the other two languages properly, and it does not need to. It only asks
 * whether the same words are spelled out in each list. Skips itself when the other files are not
 * beside it, which is the case inside the backend's Docker build.
 */
class UnitsAgreeTest {

    private static final Path REPO = Path.of("..");

    @Test
    void theThreeAmountParsersKnowTheSameUnits() throws Exception {
        Path web = REPO.resolve("web/src/utils/amount.ts");
        Path ios = REPO.resolve("ios/MealPlanner/Networking/Amount.swift");
        Assumptions.assumeTrue(Files.isRegularFile(web) && Files.isRegularFile(ios),
                "the web and iOS sources are not checked out beside this one");

        Set<String> here = keys(readJava(), "\"([a-z]+)\",\\s*\"[a-z]+\"");
        Set<String> onTheWeb = keys(between(Files.readString(web), "UNIT_ALIASES", "FRACTION_CHARS"),
                "([a-z]+)\\s*:\\s*'");
        Set<String> onThePhone = keys(between(Files.readString(ios), "units: [String: String] = [", "\n    ]"),
                "\"([a-z]+)\"\\s*:\\s*\"");

        assertThat(here).isNotEmpty();
        assertThat(onTheWeb).as("web/src/utils/amount.ts").isEqualTo(here);
        assertThat(onThePhone).as("ios/MealPlanner/Networking/Amount.swift").isEqualTo(here);
    }

    private static String readJava() throws Exception {
        String source = Files.readString(Path.of(
                "src/main/java/com/gehan/mealplanner/service/IngredientLine.java"));
        return between(source, "UNITS = Map.ofEntries(", "GLYPHS");
    }

    private static String between(String text, String from, String to) {
        int start = text.indexOf(from);
        int end = text.indexOf(to, start + from.length());
        return start < 0 || end < 0 ? "" : text.substring(start, end);
    }

    private static Set<String> keys(String block, String pattern) {
        Set<String> found = new TreeSet<>();
        Matcher matcher = Pattern.compile(pattern).matcher(block);
        while (matcher.find()) found.add(matcher.group(1));
        return found;
    }
}
