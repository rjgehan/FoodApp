package com.gehan.mealplanner.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedIngredient;
import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedRecipe;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Imports a recipe from a link by reading what the page already says about itself.
 *
 * Nearly every recipe site embeds a schema.org Recipe in a {@code <script type="application/
 * ld+json">} — the same data that puts recipe cards in search results — with the exact
 * ingredient and step lists. Reading it is instant, exact, and costs none of the twenty AI
 * requests a day. Scraping the visible text instead picks up the blog's "ingredient notes"
 * commentary, which reads like an ingredient list and is not one.
 *
 * Pages without that data are not handled here; they still go through the paste flow.
 */
@Service
public class RecipeImportService {

    private static final Logger log = LoggerFactory.getLogger(RecipeImportService.class);

    private static final Pattern LD_JSON = Pattern.compile(
            "<script[^>]+type\\s*=\\s*[\"']application/ld\\+json[\"'][^>]*>(.*?)</script>",
            Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    private static final Pattern ISO_DURATION = Pattern.compile("^P(?:\\d+D)?T(?:(\\d+)H)?(?:(\\d+)M)?");
    private static final Pattern TAGS = Pattern.compile("<[^>]+>");

    /** "00:00:44.766", and the hour is optional. */
    private static final Pattern TIMING = Pattern.compile("(?:(\\d+):)?(\\d{1,2}):(\\d{2})[.,](\\d{1,3})");
    /** Enough of them, close together, and somebody is cooking rather than singing. */
    private static final List<String> COOKING_WORDS = List.of(
            "add", "bake", "boil", "chop", "cook", "cool", "cover", "cut", "dice", "drain",
            "fry", "grill", "heat", "melt", "mix", "oven", "pan", "pour", "roast", "season",
            "serve", "simmer", "slice", "stir", "whisk", "minutes", "oil", "salt", "pepper",
            "garlic", "onion", "butter", "sauce", "dough", "degrees", "preheat");

    private static final Pattern HASHTAGS = Pattern.compile("#\\w+");
    private static final Pattern TIKTOK_DATA = Pattern.compile(
            "<script id=\"__UNIVERSAL_DATA_FOR_REHYDRATION__\"[^>]*>(.*?)</script>", Pattern.DOTALL);
    private static final int MAX_BYTES = 4 * 1024 * 1024;

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(8))
            .build();

    public GeneratedRecipe fromUrl(String rawUrl) {
        URI uri = safeUri(rawUrl);
        // An import that fails should leave a trace: without one, "the server said 422" is
        // all anybody has to go on.
        try {
            GeneratedRecipe draft = isTikTok(uri) ? fromTikTok(uri) : fromPage(uri);
            log.info("Imported \"{}\" from {} — {} ingredients", draft.name(), uri, draft.ingredients().size());
            return draft;
        } catch (ResponseStatusException e) {
            log.info("Import of {} refused: {}", uri, e.getReason());
            throw e;
        }
    }

    private GeneratedRecipe fromPage(URI uri) {
        String html = fetch(uri);
        JsonNode recipe = findRecipe(html);
        if (recipe == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "That page does not publish its recipe in a way this can read. Copy the recipe and paste it instead.");
        }
        return toDraft(recipe, uri.toString());
    }

    private boolean isTikTok(URI uri) {
        String host = uri.getHost().toLowerCase();
        return host.endsWith("tiktok.com");
    }

    /**
     * A TikTok page is rendered by JavaScript and publishes no structured data, so there is
     * nothing on it for a server to read. Its oEmbed endpoint, though, is public and needs no
     * key, and it returns the caption — which is where a recipe TikTok puts the recipe.
     *
     * When the caption is only a title and hashtags, the recipe is being spoken in the video
     * and there is nothing here to import. That is said plainly rather than guessed at.
     */
    private GeneratedRecipe fromTikTok(URI uri) {
        JsonNode item = tikTokItem(uri);
        String caption = caption(item);
        if (caption == null || caption.isBlank()) caption = oembedCaption(uri);
        if (caption == null || caption.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "That video has no caption to read.");
        }

        GeneratedRecipe draft = fromCaption(caption, uri.toString());
        if (draft.instructions() != null && !draft.instructions().isBlank()) return draft;

        // The caption listed what to buy but not what to do. TikTok transcribes the narration
        // itself and publishes it beside the video, so the spoken method can be read for free.
        String spoken = transcript(item);
        if (spoken == null) return draft;
        return new GeneratedRecipe(draft.name(), draft.description(), draft.prepTimeMinutes(),
                draft.cookTimeMinutes(), draft.servings(), draft.ingredients(), spoken);
    }

    /** The video's own record in the page, or a missing node. One fetch serves everything. */
    private JsonNode tikTokItem(URI uri) {
        try {
            return tikTokItem(fetch(uri));
        } catch (RuntimeException e) {
            // Includes ResponseStatusException from fetch(): a page that will not load is a
            // reason to fall back to oEmbed, not to give up.
            log.info("Could not read the TikTok page for {} ({})", uri, e.toString());
        }
        return mapper.missingNode();
    }

    /** The video's own data, out of the blob the page ships for its client to rehydrate from. */
    JsonNode tikTokItem(String html) {
        Matcher matcher = TIKTOK_DATA.matcher(html);
        if (!matcher.find()) return mapper.missingNode();
        return mapper.readTree(matcher.group(1))
                .path("__DEFAULT_SCOPE__").path("webapp.video-detail")
                .path("itemInfo").path("itemStruct");
    }

    /**
     * The caption, with its line breaks.
     *
     * oEmbed is the obvious source and the wrong one: its `title` holds the whole caption —
     * never truncated, checked against captions up to 1,957 characters — but every newline in
     * it has been replaced by a single space. A recipe caption arrives as one unbroken line,
     * and one line can never be split into ingredients. `contents` keeps one entry per
     * original line, so the structure survives.
     */
    private String caption(JsonNode item) {
        JsonNode contents = item.path("contents");
        if (!contents.isArray() || contents.isEmpty()) return null;
        List<String> lines = new ArrayList<>();
        for (JsonNode entry : contents) lines.add(entry.path("desc").asText(""));
        String joined = String.join("\n", lines).trim();
        return joined.isBlank() ? null : joined;
    }

    /**
     * What is said out loud, as TikTok already transcribed it.
     *
     * A creator-written caption file beats speech recognition, and English beats a machine
     * translation of it, so the tracks are ranked rather than taken in order. The URLs are
     * signed and expire in about two days, which is why the text is pulled now and the link
     * never stored.
     *
     * Returns null when there is nothing usable — including when the audio turns out to be a
     * song rather than a person cooking, which is half of the recipe videos sampled and which
     * transcribes into confident, fluent nonsense.
     */
    /**
     * The subtitle track worth reading, or a missing node.
     *
     * Only WebVTT: the other format TikTok offers is {@code creator_caption}, which is JSON of
     * a different shape. English wins over a better-sourced track in another language, because
     * the rest of the import cannot do anything with Portuguese.
     */
    JsonNode bestSubtitle(JsonNode item) {
        JsonNode best = mapper.missingNode();
        int bestScore = Integer.MIN_VALUE;
        for (JsonNode track : item.path("video").path("subtitleInfos")) {
            if (!"webvtt".equalsIgnoreCase(track.path("Format").asText(""))) continue;
            int score = switch (track.path("Source").asText("")) {
                case "LC" -> 3;   // the creator wrote it
                case "ASR" -> 2;  // TikTok listened to it
                default -> 1;     // machine translation of one of the above
            };
            if (track.path("LanguageCodeName").asText("").startsWith("eng")) score += 4;
            if (score > bestScore) {
                bestScore = score;
                best = track;
            }
        }
        return best;
    }

    private String transcript(JsonNode item) {
        JsonNode best = bestSubtitle(item);
        if (best.isMissingNode()) return null;

        try {
            // The page fetch has already happened, and the import must not hang waiting on a
            // bonus. A transcript that is slow to arrive is one the recipe does without.
            List<String> cues = cuesFrom(fetch(URI.create(best.path("Url").asText()), Duration.ofSeconds(6)));
            if (!soundsLikeCooking(String.join(" ", cues))) return null;
            return methodFrom(cues);
        } catch (RuntimeException e) {
            log.info("Could not read the TikTok transcript ({})", e.toString());
            return null;
        }
    }

    /** Visible for tests: WebVTT to plain sentences, without the timings or the repeats. */
    String fromWebVtt(String vtt) {
        return String.join(" ", cuesFrom(vtt)).replaceAll("\\s+", " ").trim();
    }

    /**
     * The spoken lines, in the order they were said.
     *
     * They stay separate because the breaks are worth keeping: TikTok cuts a cue at roughly a
     * clause, which is the only punctuation an auto-generated transcript has.
     */
    List<String> cuesFrom(String vtt) {
        record Cue(long at, int written, List<String> lines) {}

        List<Cue> cues = new ArrayList<>();
        List<String> pending = new ArrayList<>();
        long at = -1;

        for (String raw : (vtt + "\n\n").split("\r?\n")) {
            String line = raw.trim();
            if (line.contains("-->")) {
                if (at >= 0 && !pending.isEmpty()) cues.add(new Cue(at, cues.size(), List.copyOf(pending)));
                pending.clear();
                long start = startOf(line);
                at = start < 0 ? Math.max(at, 0) : start;
                continue;
            }
            if (line.isEmpty() || line.startsWith("WEBVTT") || line.startsWith("NOTE")) continue;
            if (line.matches("\\d+")) continue;
            line = TAGS.matcher(line).replaceAll("").trim();
            if (!line.isEmpty()) pending.add(line);
        }
        if (at >= 0 && !pending.isEmpty()) cues.add(new Cue(at, cues.size(), List.copyOf(pending)));

        /*
         * TikTok does not write the cues in the order they are spoken. In a real track the
         * opening line ("stop scrolling", at 0.2s) was the eleventh cue in the file. Joining
         * the file as it arrives reads almost plausibly, which is the worst kind of wrong, so
         * the start times decide the order and the file order only breaks ties.
         */
        cues.sort(java.util.Comparator.comparingLong(Cue::at).thenComparingInt(Cue::written));

        List<String> out = new ArrayList<>();
        String previous = null;
        for (Cue cue : cues) {
            for (String line : cue.lines()) {
                // Rolling captions repeat the previous line as the next one scrolls in.
                if (line.equalsIgnoreCase(previous)) continue;
                out.add(line);
                previous = line;
            }
        }
        return out;
    }

    /**
     * The verbs a cook uses. Deliberately only the bare forms, so "it is my Creamy Chicken
     * Bake" is a title and "bake it for forty minutes" is a step — and nouns are left out,
     * because "a little bit of salt to your taste" is not an instruction.
     */
    private static final Set<String> ACTIONS = Set.of(
            "add", "arrange", "assemble", "bake", "beat", "blanch", "blend", "boil", "bring",
            "brush", "chop", "coat", "combine", "cook", "crack", "crush", "dip", "drain",
            "drizzle", "dust", "flip", "fold", "fry", "garnish", "grate", "grease", "halve",
            "knead", "ladle", "layer", "marinate", "mash", "melt", "microwave", "mince", "mix",
            "pat", "peel", "poach", "pour", "preheat", "reduce", "reheat", "remove", "roast",
            "rub", "sauté", "saute",
            "scatter", "scoop", "seal", "sear", "serve", "shred", "sift", "simmer", "soak",
            "spoon", "spread", "sprinkle", "squeeze", "stir", "strain", "stuff", "sweat",
            "thicken", "toss", "transfer", "whip", "whisk", "wrap", "zest");

    /**
     * Verbs that are also perfectly good nouns, so they only count at the front of a clause.
     *
     * This is not fussiness: a real video opened on "apparently it is Butternut squash season"
     * and closed on "keep your fingers intact this squash season", and reading those two as
     * instructions kept the hook and the sign-off in the method. "Season the chicken" is the
     * real thing and it starts its sentence.
     */
    private static final Set<String> SOMETIMES_ACTIONS = Set.of(
            "brown", "chill", "cool", "cover", "cut", "dice", "fill", "finish", "grill", "lay",
            "leave", "let", "line", "place", "pop", "press", "put", "rest", "roll", "season",
            "set", "slice", "stand", "steam", "take", "toast", "top", "trim", "turn");

    /** How far into a clause one of those can still be the instruction. */
    private static final int IMPERATIVE_WINDOW = 4;

    /** Where a speaker starts the next thing they do. */
    private static final List<String> STEP_STARTS = List.of(
            "and then", "then", "after that", "afterwards", "after", "next", "once", "now",
            "first", "firstly", "secondly", "finally", "lastly", "meanwhile", "start by",
            "begin by", "when", "while");

    /**
     * Telling you about it rather than telling you to do it. "We" is deliberately not here:
     * "we can remove the seeds" is how half of them narrate the actual cooking.
     */
    private static final List<String> ASIDES = List.of(
            " i ", " i'", " my ", " me ", "you'll love", "trust me", "link in bio",
            "recipe is below", "recipe below", "follow for", "follow me", "save this");

    /** A sentence ends, and "1.5" and "375." do not. */
    private static final Pattern SENTENCE_END = Pattern.compile("(?<=[.!?])\\s+");

    /**
     * The method, pulled out of what was said.
     *
     * A narrated video is mostly not the recipe. It opens on a hook and a pitch, wanders into
     * why the creator likes it, and closes asking you to follow — and the cooking sits in the
     * middle. So the run from the first instruction to the last one is kept and everything
     * either side is dropped, rather than picking out single cues: the lines between two
     * instructions are usually the rest of the same sentence ("bake it for forty five" /
     * "fifty minutes until golden"), and dropping those loses the half that matters.
     *
     * Then the run is cut into steps wherever the speaker moves on. This is all guesswork
     * about English, not understanding, so it aims to be roughly right and never silent: a
     * transcript it cannot make sense of yields no method at all.
     */
    String methodFrom(List<String> cues) {
        /*
         * Some transcripts are punctuated and some are not, and it changes what a step is.
         * When there are sentences, use them: they are complete thoughts, and one of them is
         * one step. Without them the cue breaks are the only punctuation there is, and a cue
         * is half a thought, so the run has to be kept whole and cut at the words a speaker
         * uses to move on.
         */
        String joined = String.join(" ", cues).replaceAll("\\s+", " ").trim();
        boolean punctuated = joined.split("[.!?]").length >= 4;
        List<String> units = punctuated ? List.of(SENTENCE_END.split(joined)) : cues;

        int first = -1;
        int last = -1;
        for (int i = 0; i < units.size(); i++) {
            if (!isInstruction(units.get(i))) continue;
            if (first < 0) first = i;
            last = i;
        }
        // Narrated entirely in the first person ("I'm going to add the garlic") — still a
        // method, just told as a story. Fall back to anything with an action in it.
        if (first < 0) {
            for (int i = 0; i < units.size(); i++) {
                if (!hasAction(units.get(i))) continue;
                if (first < 0) first = i;
                last = i;
            }
        }
        if (first < 0) return null;

        List<String> kept = units.subList(first, last + 1);
        List<String> steps = new ArrayList<>();
        if (punctuated) {
            steps.addAll(kept);
        } else {
            StringBuilder current = new StringBuilder();
            for (String cue : kept) {
                if (!current.isEmpty() && startsAStep(cue)) {
                    steps.add(current.toString());
                    current.setLength(0);
                }
                if (!current.isEmpty()) current.append(' ');
                current.append(cue);
            }
            steps.add(current.toString());
        }

        List<String> out = new ArrayList<>();
        for (String step : steps) {
            // "This will give us two clean halves" is the result, not something to do. And
            // "that is literally it" is not a step, however charming.
            if (!hasAction(step)) continue;
            out.add(tidy(step));
        }
        return out.isEmpty() ? null : String.join("\n", out);
    }

    /** Something to do, said as an instruction rather than as a story about one. */
    private boolean isInstruction(String cue) {
        String padded = " " + cue.toLowerCase() + " ";
        for (String aside : ASIDES) {
            if (padded.contains(aside.startsWith(" ") ? aside : " " + aside)) return false;
        }
        return hasAction(cue);
    }

    private boolean hasAction(String text) {
        int at = 0;
        for (String word : text.toLowerCase().split("[^a-zà-ÿ']+")) {
            // A leading "1." or a stray space splits to an empty first token; it is not a word.
            if (word.isEmpty()) continue;
            if (ACTIONS.contains(word)) return true;
            if (at < IMPERATIVE_WINDOW && SOMETIMES_ACTIONS.contains(word)) return true;
            at++;
        }
        return false;
    }

    private boolean startsAStep(String cue) {
        String lowered = cue.toLowerCase().trim();
        for (String marker : STEP_STARTS) {
            if (lowered.equals(marker)) return true;
            if (lowered.startsWith(marker + " ")) return true;
        }
        return false;
    }

    /** A spoken clause, written down: no leading "and", a capital, and a full stop. */
    private String tidy(String step) {
        String out = step.trim().replaceAll("\\s+", " ");
        if (out.toLowerCase().startsWith("and ")) out = out.substring(4);
        if (out.isEmpty()) return out;
        out = Character.toUpperCase(out.charAt(0)) + out.substring(1);
        char end = out.charAt(out.length() - 1);
        return end == '.' || end == '!' || end == '?' ? out : out + ".";
    }

    /** The start of "00:00:44.766 --> 00:00:47.893" in milliseconds, or -1 if it has none. */
    private static long startOf(String timing) {
        Matcher m = TIMING.matcher(timing.substring(0, timing.indexOf("-->")));
        if (!m.find()) return -1;
        long hours = m.group(1) == null ? 0 : Long.parseLong(m.group(1));
        long minutes = Long.parseLong(m.group(2));
        long seconds = Long.parseLong(m.group(3));
        long millis = Long.parseLong((m.group(4) + "00").substring(0, 3));
        return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
    }

    /**
     * Visible for tests. A transcript is only worth keeping if somebody is cooking in it: half
     * the sampled videos play a licensed song instead, and the transcript comes back as fluent,
     * confident song lyrics with nothing to mark them as wrong.
     */
    boolean soundsLikeCooking(String text) {
        if (text == null || text.length() < 40) return false;
        String lowered = text.toLowerCase();
        int hits = 0;
        for (String verb : COOKING_WORDS) {
            if (lowered.contains(verb)) hits++;
        }
        return hits >= 3;
    }

    private String oembedCaption(URI uri) {
        URI oembed = URI.create("https://www.tiktok.com/oembed?url="
                + URLEncoder.encode(uri.toString(), StandardCharsets.UTF_8));
        try {
            return text(mapper.readTree(fetch(oembed)), "title");
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "TikTok did not answer for that video.");
        }
    }

    /** Visible for tests: a caption, split into a recipe. */
    GeneratedRecipe fromCaption(String caption, String sourceUrl) {
        List<String> lines = new ArrayList<>();
        for (String raw : caption.replace("\\n", "\n").split("\r?\n")) {
            String line = HASHTAGS.matcher(raw).replaceAll(" ").replaceAll("\\s+", " ").trim();
            if (!line.isBlank()) lines.add(line);
        }
        if (lines.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "That caption is only hashtags.");
        }

        String name = lines.get(0).replaceAll("[:\\-–—]+$", "").trim();

        // A caption that labels its own sections is far more reliable than any guess.
        int ingredientsAt = indexOfHeading(lines, "ingredient");
        int stepsAt = indexOfHeading(lines, "method", "instruction", "direction", "steps");

        List<GeneratedIngredient> ingredients = new ArrayList<>();
        List<String> steps = new ArrayList<>();

        if (ingredientsAt >= 0) {
            int end = stepsAt > ingredientsAt ? stepsAt : lines.size();
            for (String line : lines.subList(ingredientsAt + 1, end)) add(ingredients, line);
            if (stepsAt >= 0) steps.addAll(lines.subList(stepsAt + 1, lines.size()));
        } else {
            /*
             No headings. An ingredient list is a contiguous run of short lines, so find where
             it starts — the first line with an amount — and take everything short after it,
             amount or not, until the prose begins.
             *
             Picking out only the lines with amounts, which is the obvious thing to do, quietly
             loses the ones without: "Sea salt to taste", "Juice of one lemon", and — measured
             on a real caption — "1kg-1.2kg chicken thighs", the main ingredient. A recipe
             missing its chicken is worse than no recipe at all.
            */
            int start = -1;
            for (int i = 1; i < lines.size() && start < 0; i++) {
                if (IngredientLine.of(lines.get(i)).quantity() != null) start = i;
            }
            int end = start;
            if (start >= 0) {
                for (int i = start; i < lines.size(); i++) {
                    if (!looksLikeAnIngredient(lines.get(i))) break;
                    add(ingredients, lines.get(i));
                    end = i;
                }
                if (end + 1 < lines.size()) steps.addAll(lines.subList(end + 1, lines.size()));
            }
        }

        if (ingredients.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "That caption does not list any ingredients — the recipe is probably spoken in the video.");
        }
        return new GeneratedRecipe(name, sourceUrl, null, null, 4, ingredients, String.join("\n", steps));
    }

    /**
     * Short, and not a sentence. An ingredient is "2 tbsp butter" or "Sea salt to taste";
     * a step is a sentence that ends in a full stop. The length cap is what keeps a long
     * unpunctuated instruction out of the shopping list.
     */
    private boolean looksLikeAnIngredient(String line) {
        String trimmed = line.trim();
        if (trimmed.length() > 80) return false;
        if (trimmed.endsWith(".") || trimmed.endsWith("!") || trimmed.endsWith("?")) return false;
        return true;
    }

    private void add(List<GeneratedIngredient> out, String line) {
        // "For the salmon:" and "Sauce:" divide an ingredient list; they are not in it. A
        // heading has no amount and ends in a colon, which "salt and pepper" does not.
        if (line.trim().endsWith(":")) return;
        IngredientLine parsed = IngredientLine.of(line);
        if (parsed.name().isBlank()) return;
        out.add(new GeneratedIngredient(parsed.name(), parsed.quantity(), parsed.unit()));
    }

    private int indexOfHeading(List<String> lines, String... words) {
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i).toLowerCase().replaceAll("[^a-z]", "");
            for (String word : words) {
                if (line.equals(word) || line.equals(word + "s") || line.equals(word + "list")) return i;
            }
        }
        return -1;
    }

    /**
     * This server sits on a home network, so a link is not automatically safe to fetch: an
     * address like 192.168.1.1 or localhost would make the server reach its own neighbours.
     * Only public http(s) hosts are followed.
     */
    private URI safeUri(String raw) {
        URI uri;
        try {
            uri = URI.create(raw.trim());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That is not a link.");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (!scheme.equals("http") && !scheme.equals("https")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only web links can be imported.");
        }
        if (uri.getHost() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That link has no site in it.");
        }
        try {
            for (InetAddress address : InetAddress.getAllByName(uri.getHost())) {
                if (address.isLoopbackAddress() || address.isSiteLocalAddress() || address.isLinkLocalAddress()
                        || address.isAnyLocalAddress() || address.isMulticastAddress()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That link points inside the network.");
                }
            }
        } catch (UnknownHostException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That site could not be found.");
        }
        return uri;
    }

    private String fetch(URI uri) {
        return fetch(uri, Duration.ofSeconds(20));
    }

    private String fetch(URI uri, Duration timeout) {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(timeout)
                // Some recipe sites serve a stub to anything that does not look like a browser.
                .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                        + "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
                .header("Accept", "text/html,application/xhtml+xml")
                .GET()
                .build();
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 403 || response.statusCode() == 429) {
                // Bot protection. The phone's share sheet still works on these, because
                // Safari is already on the page as a person.
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "That site will not let this server read it. Copy the recipe and paste it instead.");
            }
            if (response.statusCode() >= 400) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "That page answered " + response.statusCode() + ".");
            }
            String body = response.body();
            return body.length() > MAX_BYTES ? body.substring(0, MAX_BYTES) : body;
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Could not reach that page.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Could not reach that page.");
        }
    }

    /** Visible for tests: pulls the Recipe out of a page's JSON-LD, wherever it is nested. */
    JsonNode findRecipe(String html) {
        Matcher matcher = LD_JSON.matcher(html);
        while (matcher.find()) {
            JsonNode parsed;
            try {
                parsed = mapper.readTree(matcher.group(1));
            } catch (RuntimeException e) {
                // A page with malformed JSON-LD is common; try the next block.
                continue;
            }
            JsonNode found = search(parsed);
            if (found != null) return found;
        }
        return null;
    }

    /** The Recipe sits at the top, in an array, or inside an {@code @graph}. */
    private JsonNode search(JsonNode node) {
        if (node == null) return null;
        if (node.isArray()) {
            for (JsonNode child : node) {
                JsonNode found = search(child);
                if (found != null) return found;
            }
            return null;
        }
        if (!node.isObject()) return null;
        if (isRecipe(node.get("@type")) && node.has("recipeIngredient")) return node;
        if (node.has("@graph")) return search(node.get("@graph"));
        return null;
    }

    private boolean isRecipe(JsonNode type) {
        if (type == null) return false;
        if (type.isArray()) {
            for (JsonNode one : type) {
                if ("Recipe".equals(one.asText())) return true;
            }
            return false;
        }
        return "Recipe".equals(type.asText());
    }

    GeneratedRecipe toDraft(JsonNode recipe, String sourceUrl) {
        List<GeneratedIngredient> ingredients = new ArrayList<>();
        for (JsonNode line : recipe.withArray("recipeIngredient")) {
            IngredientLine parsed = IngredientLine.of(line.asText());
            if (parsed.name().isBlank()) continue;
            ingredients.add(new GeneratedIngredient(parsed.name(), parsed.quantity(), parsed.unit()));
        }

        List<String> steps = new ArrayList<>();
        collectSteps(recipe.get("recipeInstructions"), steps);

        int prep = minutes(text(recipe, "prepTime"));
        int cook = minutes(text(recipe, "cookTime"));
        if (cook == 0) cook = minutes(text(recipe, "totalTime"));

        return new GeneratedRecipe(
                text(recipe, "name"),
                sourceUrl,
                prep > 0 ? prep : null,
                cook > 0 ? cook : null,
                Math.max(1, servings(recipe.get("recipeYield"))),
                ingredients,
                String.join("\n", steps));
    }

    /** Steps arrive as strings, as HowToStep objects, or as HowToSections holding steps. */
    private void collectSteps(JsonNode node, List<String> out) {
        if (node == null || node.isNull()) return;
        if (node.isTextual()) {
            for (String piece : node.asText().split("\\r?\\n")) {
                String step = TAGS.matcher(piece).replaceAll("").trim();
                if (!step.isBlank()) out.add(step);
            }
            return;
        }
        if (node.isArray()) {
            for (JsonNode child : node) collectSteps(child, out);
            return;
        }
        if (node.has("itemListElement")) {
            collectSteps(node.get("itemListElement"), out);
            return;
        }
        if (node.has("text")) {
            String step = TAGS.matcher(node.get("text").asText()).replaceAll("").trim();
            if (!step.isBlank()) out.add(step);
        }
    }

    private int servings(JsonNode yield) {
        if (yield == null) return 0;
        JsonNode value = yield.isArray() && !yield.isEmpty() ? yield.get(0) : yield;
        if (value.isNumber()) return value.asInt();
        Matcher digits = Pattern.compile("\\d+").matcher(value.asText(""));
        return digits.find() ? Integer.parseInt(digits.group()) : 0;
    }

    private int minutes(String iso) {
        if (iso == null) return 0;
        Matcher matcher = ISO_DURATION.matcher(iso);
        if (!matcher.find()) return 0;
        int hours = matcher.group(1) == null ? 0 : Integer.parseInt(matcher.group(1));
        int mins = matcher.group(2) == null ? 0 : Integer.parseInt(matcher.group(2));
        return hours * 60 + mins;
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}
