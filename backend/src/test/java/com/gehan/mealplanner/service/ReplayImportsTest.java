package com.gehan.mealplanner.service;

import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedIngredient;
import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedRecipe;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

/**
 * Re-runs the importer over every import that has actually happened.
 *
 * {@link ImportLog} keeps the caption and the transcript of each one, so a change to the
 * parsing can be judged against every real caption collected so far instead of against the
 * last video somebody sent. Run it before and after a change and read the difference:
 *
 * <pre>./mvnw test -Dtest=ReplayImportsTest -DfailIfNoTests=false</pre>
 *
 * Skips itself when nothing has been imported yet. It asserts almost nothing on purpose —
 * there is no right answer to assert against, only output to read. The refusals at the end
 * are the list of formats still worth beating.
 */
class ReplayImportsTest {

    private final RecipeImportService service = new RecipeImportService();
    private final ObjectMapper mapper = new ObjectMapper();

    private static Path directory() {
        String configured = System.getProperty("importLog", System.getenv("MEALPLANNER_IMPORT_LOG"));
        return configured != null && !configured.isBlank()
                ? Path.of(configured)
                : Path.of(System.getProperty("user.home"), ".mealplanner", "imports");
    }

    @Test
    void readEveryCaptionAgain() throws Exception {
        Path directory = directory();
        Assumptions.assumeTrue(Files.isDirectory(directory), "nothing imported yet: " + directory);

        List<String> rows = new ArrayList<>();
        try (Stream<Path> files = Files.list(directory)) {
            for (Path file : files.filter(f -> f.getFileName().toString().endsWith(".jsonl")).sorted().toList()) {
                rows.addAll(Files.readAllLines(file));
            }
        }
        Assumptions.assumeFalse(rows.isEmpty(), "no imports recorded yet in " + directory);

        List<String> refused = new ArrayList<>();
        int replayed = 0;
        System.out.println("=== " + rows.size() + " imports from " + directory + " ===");

        for (String line : rows) {
            if (line.isBlank()) continue;
            JsonNode row;
            try {
                row = mapper.readTree(line);
            } catch (RuntimeException e) {
                continue;
            }

            String url = row.path("url").asText("");
            String caption = row.path("given").path("caption").asText(null);
            List<String> heard = new ArrayList<>();
            for (JsonNode cue : row.path("given").path("heard")) heard.add(cue.asText());

            if ("refused".equals(row.path("outcome").asText())) {
                refused.add(row.path("reason").asText("?") + "\n      " + url
                        + (caption == null ? "" : "\n      caption: " + oneLine(caption)));
            }
            if (caption == null && heard.isEmpty()) continue;
            replayed++;

            System.out.println("\n--- " + url);
            if (caption != null) {
                try {
                    GeneratedRecipe now = service.fromCaption(caption, url);
                    System.out.println("  caption -> \"" + now.name() + "\", "
                            + now.ingredients().size() + " ingredients, " + count(now.instructions()) + " steps");
                    was(row, now);
                } catch (RuntimeException e) {
                    System.out.println("  caption -> refused: " + e.getMessage());
                }
            }
            if (!heard.isEmpty()) {
                RecipeImportService.Method method = service.methodOf(heard);
                List<GeneratedIngredient> spoken = method.written() == null
                        ? List.of() : SpokenIngredients.from(method.written());
                System.out.println("  spoken  -> " + count(method.written()) + " steps, "
                        + spoken.size() + " ingredients off the transcript");
            }
        }

        System.out.println("\n=== replayed " + replayed + " ===");
        if (!refused.isEmpty()) {
            System.out.println("=== " + refused.size() + " were refused — the formats still worth beating ===");
            for (String one : refused) System.out.println("  - " + one);
        }
    }

    /** What changed since the import was done, which is the whole reason to run this. */
    private void was(JsonNode row, GeneratedRecipe now) {
        JsonNode made = row.path("made");
        if (made.isMissingNode()) return;
        String before = made.path("name").asText("");
        if (!before.equals(now.name())) {
            System.out.println("  NAME was \"" + before + "\" and is now \"" + now.name() + "\"");
        }
        int wasCount = made.path("ingredients").size();
        if (wasCount != now.ingredients().size()) {
            System.out.println("  INGREDIENTS were " + wasCount + " and are now " + now.ingredients().size());
        }
        int wasSteps = made.path("steps").size();
        if (wasSteps != count(now.instructions())) {
            System.out.println("  STEPS were " + wasSteps + " and are now " + count(now.instructions()));
        }
    }

    private static int count(String instructions) {
        return instructions == null || instructions.isBlank() ? 0 : instructions.split("\n").length;
    }

    private static String oneLine(String text) {
        String flat = text.replaceAll("\\s+", " ").trim();
        return flat.length() > 160 ? flat.substring(0, 160) + "…" : flat;
    }
}
