package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.domain.RecipeSourceLink;
import com.gehan.mealplanner.dto.RecipeDtos.SourceLink;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

/**
 * A recipe's links: the page it came from, the TikTok of it being made, anything else worth
 * keeping. The rules for them live here so the recipe form, the old single-link fields, the
 * video endpoint, the importer and the startup backfill all agree on what a link is.
 *
 * Before there were many, a recipe had one {@code sourceUrl} and one {@code videoUrl}. Phones
 * already installed still read and send those, so both are derived from the list — the first
 * video, and the first link that is not one.
 */
public final class SourceLinks {

    /** Plenty for a recipe, and a ceiling on what one request can make the server store. */
    public static final int MAX_LINKS = 20;

    /**
     * What a request may send before blank rows are dropped — only there so one request cannot
     * be made enormous. The real limit is {@link #MAX_LINKS}, counted after cleaning, so a form
     * with twenty links and an empty row still saves.
     */
    public static final int MAX_ROWS_SENT = 100;

    /**
     * The name given to an old video link on a site not in {@link #VIDEO_HOSTS} — a Facebook
     * reel, say. Without it the link would join the list as a plain page and nobody could tell
     * it had been the recipe's video.
     */
    static final String VIDEO_LABEL = "Video";

    /**
     * Where a link is a video of the cooking rather than a page about it. The web keeps the same
     * list in utils/videoLink.ts, so "Watch on TikTok" and the old videoUrl pick the same link.
     */
    private static final List<String> VIDEO_HOSTS = List.of(
            "tiktok.com", "youtube.com", "youtu.be", "instagram.com", "vimeo.com");

    private SourceLinks() {
    }

    public static boolean isVideo(String url) {
        String host = hostOf(url);
        return host != null && VIDEO_HOSTS.stream().anyMatch(v -> host.equals(v) || host.endsWith("." + v));
    }

    /** The link an old client knows as videoUrl. */
    public static String firstVideo(List<SourceLink> links) {
        return links.stream().map(SourceLink::url).filter(SourceLinks::isVideo).findFirst().orElse(null);
    }

    /** The link an old client knows as sourceUrl. */
    public static String firstSource(List<SourceLink> links) {
        return links.stream().map(SourceLink::url).filter(u -> !isVideo(u)).findFirst().orElse(null);
    }

    /**
     * What the recipe holds now, as the API shapes it. A recipe the startup backfill has not
     * reached yet — or could not — still has its links in the old columns, so those are read
     * instead of showing it with none; a save from there writes them into the list for good.
     */
    public static List<SourceLink> of(Recipe recipe) {
        List<SourceLink> stored = stored(recipe);
        return stored.isEmpty() ? fromLegacy(recipe.getSourceUrl(), recipe.getVideoUrl()) : stored;
    }

    /** Only the rows in the list, without falling back to the old columns. */
    private static List<SourceLink> stored(Recipe recipe) {
        return recipe.getLinks().stream()
                .map(l -> new SourceLink(l.getUrl(), l.getLabel()))
                .toList();
    }

    /** Whether today's rules would keep this as a link at all. */
    public static boolean isLink(String raw) {
        try {
            String url = WebLinks.normalize(raw);
            return url != null && url.length() <= RecipeSourceLink.MAX_URL;
        } catch (ResponseStatusException notALink) {
            return false;
        }
    }

    /**
     * Links as somebody sent them, made safe to keep: each one normalized (http(s) only, a bare
     * "tiktok.com/…" given its https://), labels trimmed with blank meaning none, and the same
     * link twice kept once — first place wins. Anything that is not a link is refused, so a typo
     * is said out loud rather than quietly dropped.
     */
    public static List<SourceLink> clean(List<SourceLink> raw) {
        List<SourceLink> out = new ArrayList<>();
        if (raw == null) {
            return out;
        }
        for (SourceLink link : raw) {
            if (link == null) {
                continue;
            }
            String url = normalizeNamed(link.url());
            // An empty row in the form is an unfinished thought, not a link.
            if (url == null) {
                continue;
            }
            if (url.length() > RecipeSourceLink.MAX_URL) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That link is too long.");
            }
            if (out.stream().anyMatch(kept -> same(kept.url(), url))) {
                continue;
            }
            out.add(new SourceLink(url, label(link.label())));
        }
        if (out.size() > MAX_LINKS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A recipe can keep up to " + MAX_LINKS + " links.");
        }
        return out;
    }

    /**
     * The same, for links already in the database from before this existed: one that would not
     * pass today is skipped rather than refused, because there is nobody to show the error to.
     * The startup backfill keeps what was skipped by moving it into the description.
     */
    public static List<SourceLink> fromLegacy(String sourceUrl, String videoUrl) {
        List<SourceLink> out = new ArrayList<>();
        String[] raws = {sourceUrl, videoUrl};
        for (int i = 0; i < raws.length; i++) {
            if (!isLink(raws[i])) {
                continue;
            }
            String url = WebLinks.normalize(raws[i]);
            boolean oldVideo = i == 1;
            if (out.stream().noneMatch(kept -> same(kept.url(), url))) {
                out.add(new SourceLink(url, oldVideo && !isVideo(url) ? VIDEO_LABEL : null));
            }
        }
        return out;
    }

    /**
     * What an old client's single fields add to the links a recipe already has. They only ever
     * add: a phone that does not know about links sends no sourceUrl or videoUrl at all, and
     * that is not a request to delete them.
     */
    public static List<SourceLink> withLegacy(List<SourceLink> current, String sourceUrl, String videoUrl) {
        List<SourceLink> merged = new ArrayList<>(clean(current));
        for (String raw : new String[] {sourceUrl, videoUrl}) {
            /*
             * A client that has never heard of the limit is not told about it: past it, its
             * extra link is left off rather than failing the whole save — the name, ingredients
             * and method it came to change. Likewise a sourceUrl that is not a link: the old
             * field was never checked, and no old form has anywhere to show the refusal.
             */
            if (isLink(raw) && merged.size() < MAX_LINKS) {
                merged = clean(append(merged, new SourceLink(raw, null)));
            }
        }
        return merged;
    }

    private static List<SourceLink> append(List<SourceLink> links, SourceLink link) {
        List<SourceLink> out = new ArrayList<>(links);
        out.add(link);
        return out;
    }

    /**
     * Writes the list onto the recipe, in order, and brings the old single-link columns into
     * step with it — so a recipe whose links were all removed has nothing left there either for
     * the startup backfill to bring back.
     */
    public static void replace(Recipe recipe, List<SourceLink> links) {
        if (!links.equals(stored(recipe))) {
            recipe.getLinks().clear();
            for (int i = 0; i < links.size(); i++) {
                recipe.getLinks().add(RecipeSourceLink.builder()
                        .recipe(recipe)
                        .url(links.get(i).url())
                        .label(links.get(i).label())
                        .position(i)
                        .build());
            }
        }
        /*
         * Text in an old column that was never a link — "Adapted from Serious Eats", from the
         * days the paste flow filled it unchecked — is not in the list, so writing the list over
         * it would erase it. It stays until the startup backfill moves it into the description.
         */
        if (recipe.getSourceUrl() == null || isLink(recipe.getSourceUrl())) {
            recipe.setSourceUrl(firstSource(links));
        }
        if (recipe.getVideoUrl() == null || isLink(recipe.getVideoUrl())) {
            recipe.setVideoUrl(firstVideo(links));
        }
    }

    /** The same page pasted twice, once with a trailing slash — the one difference people make by accident. */
    private static boolean same(String a, String b) {
        return Objects.equals(trimSlash(a), trimSlash(b));
    }

    private static String trimSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    /**
     * {@link WebLinks#normalize}, but a refusal says which link — with several on the form,
     * "that doesn't look like a link" leaves people guessing — and doesn't ask for an https://
     * the form never needed.
     */
    private static String normalizeNamed(String raw) {
        try {
            return WebLinks.normalize(raw);
        } catch (ResponseStatusException notALink) {
            String shown = raw.trim();
            if (shown.length() > 40) {
                shown = shown.substring(0, 39) + "…";
            }
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "\"" + shown + "\" isn't a web address. Try one like tiktok.com/… or https://…");
        }
    }

    private static String label(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String label = raw.trim().replaceAll("\\s+", " ");
        if (label.length() > RecipeSourceLink.MAX_LABEL) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Keep a link's name under " + RecipeSourceLink.MAX_LABEL + " characters.");
        }
        return label;
    }

    private static String hostOf(String url) {
        if (url == null) {
            return null;
        }
        try {
            String host = URI.create(url).getHost();
            return host == null ? null : host.toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
