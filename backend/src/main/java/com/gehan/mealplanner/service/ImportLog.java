package com.gehan.mealplanner.service;

import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedIngredient;
import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedRecipe;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Keeps what each import was given and what it made of it, so the next round of guessing
 * about captions can be done against real ones.
 *
 * Every rule in the importer came from a single video that broke it: the caption that opened
 * "is it time?", the sentence that started "Because", the comma between the onion and the
 * garlic. One video at a time is a slow way to find those, and the interesting formats are
 * the ones nobody thought of.
 *
 * So the INPUTS are what matter here — the caption exactly as written and the transcript
 * exactly as spoken. With those the parsers can be re-run offline over every import ever
 * done, and a change can be judged on all of them instead of on the last one. The output is
 * saved beside them only to see what changed.
 *
 * Refusals are saved too, and are worth more than the successes: a 422 is a format that
 * beat us, which is exactly the thing worth reading later.
 *
 * One JSON object per line, one file per day, outside the repo. Nothing here is allowed to
 * fail an import — a lost note costs nothing, a lost recipe is the whole point.
 */
@Component
public class ImportLog {

    private static final Logger log = LoggerFactory.getLogger(ImportLog.class);

    /** Big enough for any caption; small enough that one video cannot fill a disk. */
    private static final int MOST_CHARACTERS = 20_000;

    private final ObjectMapper mapper = new ObjectMapper();
    private final Path directory;

    ImportLog(@Value("${mealplanner.import-log:}") String configured) {
        this.directory = directoryFrom(configured);
        if (directory != null) log.info("Keeping a note of every import in {}", directory);
    }

    /** Off when set to "off"; otherwise a folder in the home directory, outside the repo. */
    private static Path directoryFrom(String configured) {
        String setting = configured == null ? "" : configured.trim();
        if (setting.equalsIgnoreCase("off") || setting.equalsIgnoreCase("false")) return null;
        try {
            Path path = setting.isEmpty()
                    ? Path.of(System.getProperty("user.home"), ".mealplanner", "imports")
                    : Path.of(setting);
            Files.createDirectories(path);
            return path;
        } catch (RuntimeException | IOException e) {
            log.info("Not keeping import notes ({})", e.toString());
            return null;
        }
    }

    boolean isOn() {
        return directory != null;
    }

    Entry begin(URI uri) {
        return new Entry(uri);
    }

    /** What one import was handed, filled in as it goes. */
    static final class Entry {
        private final URI uri;
        private final Instant at = Instant.now();
        private String caption;
        private List<String> cues;
        private String publishedRecipe;

        private Entry(URI uri) {
            this.uri = uri;
        }

        void caption(String text) {
            this.caption = text;
        }

        void spoken(List<String> heard) {
            this.cues = heard == null ? null : List.copyOf(heard);
        }

        void published(String jsonLd) {
            this.publishedRecipe = jsonLd;
        }
    }

    void finish(Entry entry, GeneratedRecipe made, String refused) {
        if (directory == null || entry == null) return;
        try {
            ObjectNode row = mapper.createObjectNode();
            row.put("at", entry.at.toString());
            row.put("url", String.valueOf(entry.uri));
            row.put("host", entry.uri.getHost());
            row.put("outcome", made != null ? "imported" : "refused");
            if (refused != null) row.put("reason", refused);

            ObjectNode given = row.putObject("given");
            if (entry.caption != null) given.put("caption", cut(entry.caption));
            if (entry.publishedRecipe != null) given.put("published", cut(entry.publishedRecipe));
            if (entry.cues != null) given.set("heard", strings(entry.cues));

            if (made != null) row.set("made", made(made));

            Path file = directory.resolve("imports-" + LocalDate.now() + ".jsonl");
            Files.writeString(file, mapper.writeValueAsString(row) + "\n", StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (RuntimeException | IOException e) {
            // A note that cannot be written is not a reason to lose the recipe.
            log.debug("Could not note the import of {} ({})", entry.uri, e.toString());
        }
    }

    private ObjectNode made(GeneratedRecipe recipe) {
        ObjectNode out = mapper.createObjectNode();
        out.put("name", recipe.name());
        out.put("methodSource", String.valueOf(recipe.methodSource()));
        out.put("servings", recipe.servings());

        ArrayNode ingredients = out.putArray("ingredients");
        for (GeneratedIngredient one : recipe.ingredients()) {
            ObjectNode row = ingredients.addObject();
            row.put("name", one.ingredientName());
            if (one.quantity() != null) row.put("quantity", one.quantity());
            if (one.unit() != null) row.put("unit", one.unit());
        }

        List<String> steps = recipe.instructions() == null || recipe.instructions().isBlank()
                ? List.of()
                : List.of(recipe.instructions().split("\n"));
        out.set("steps", strings(steps));
        if (!recipe.spokenLines().isEmpty()) out.set("spokenLines", strings(recipe.spokenLines()));
        return out;
    }

    private ArrayNode strings(List<String> values) {
        ArrayNode out = mapper.createArrayNode();
        List<String> capped = new ArrayList<>(values);
        for (String value : capped) out.add(cut(value));
        return out;
    }

    private static String cut(String text) {
        return text.length() > MOST_CHARACTERS ? text.substring(0, MOST_CHARACTERS) + "…" : text;
    }
}
