package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.RecipeSourceLink;
import com.gehan.mealplanner.domain.SavedLinkSource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The rules for a saved link's address, name and picture, in one place so saving one, deleting
 * one and deleting a whole account agree on them.
 */
public final class SavedLinks {

    /** "@cook" out of tiktok.com/@cook/video/…, for naming a video the page would not describe. */
    private static final Pattern TIKTOK_HANDLE = Pattern.compile("/@([\\w.]+)");

    /** Long enough for any dish's name; a caption's opening line runs on well past it. */
    static final int NAME_LENGTH = 80;

    private SavedLinks() {
    }

    /**
     * The link as it is kept: http(s) only, a bare "tiktok.com/…" given its https://, and — on
     * TikTok and Instagram — without the query. Theirs is only tracking ("?igsh=…", "?_t=…"),
     * different every time the same video is shared, so leaving it on would save one Reel twice.
     * A website's query can be the page itself, so it stays.
     */
    public static String clean(String raw) {
        String found = RecipeImportService.linkIn(raw);
        if (found.contains(" ")) {
            found = bareAddressIn(found);
        }
        String link = WebLinks.normalize(found);
        if (link == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That doesn't look like a link.");
        }
        if (link.length() > RecipeSourceLink.MAX_URL) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That link is too long.");
        }
        SavedLinkSource source = sourceOf(link);
        if (source != SavedLinkSource.WEB) {
            int query = link.indexOf('?');
            int fragment = link.indexOf('#');
            int cut = query >= 0 ? query : fragment;
            if (cut > 0) {
                link = link.substring(0, cut);
            }
        }
        return link;
    }

    /**
     * "Try this! instagram.com/reel/abc" — an address typed the way people type them, with no
     * https://, in the middle of a sentence. The import leaves those alone; keeping a link is
     * forgiving, because the link is the whole of what is kept. Text with no such address comes
     * back as it was, to be refused in a sentence.
     */
    private static String bareAddressIn(String text) {
        for (String word : text.split("\\s+")) {
            String candidate = word.replaceAll("[.,;:!?)\\]}'\"”’]+$", "");
            if (BARE_ADDRESS.matcher(candidate).matches()) {
                return candidate;
            }
        }
        return text;
    }

    private static final Pattern BARE_ADDRESS = Pattern.compile("(?i)^[a-z0-9-]+(\\.[a-z0-9-]+)*\\.[a-z]{2,}(/\\S*)?$");

    public static SavedLinkSource sourceOf(String url) {
        String host = hostOf(url);
        if (host == null) {
            return SavedLinkSource.WEB;
        }
        if (host.equals("tiktok.com") || host.endsWith(".tiktok.com")) {
            return SavedLinkSource.TIKTOK;
        }
        if (host.equals("instagram.com") || host.endsWith(".instagram.com")) {
            return SavedLinkSource.INSTAGRAM;
        }
        return SavedLinkSource.WEB;
    }

    /**
     * The same page, give or take what people and apps change by accident: the trailing slash,
     * http or https, and the www. — Instagram shares with it, and people type it without.
     */
    public static boolean same(String a, String b) {
        return Objects.equals(comparable(a), comparable(b));
    }

    private static String comparable(String url) {
        if (url == null) {
            return null;
        }
        String rest = url.replaceFirst("(?i)^https?://(www\\.)?", "");
        // Only the host is case-blind: a TikTok short link's path is not.
        int slash = rest.indexOf('/');
        String host = slash < 0 ? rest : rest.substring(0, slash);
        return trimSlash(host.toLowerCase(Locale.ROOT) + (slash < 0 ? "" : rest.substring(slash)));
    }

    /**
     * What to call a link when its page would not say: whose TikTok it is when the address shows
     * that, "Instagram post", or the site's address. Never blank, so a save never fails for want
     * of a name.
     */
    public static String fallbackName(String url) {
        return switch (sourceOf(url)) {
            case TIKTOK -> {
                Matcher handle = TIKTOK_HANDLE.matcher(url);
                yield handle.find() ? "TikTok from @" + handle.group(1) : "TikTok video";
            }
            case INSTAGRAM -> "Instagram post";
            case WEB -> {
                String host = hostOf(url);
                yield host == null ? "Saved link" : host.replaceFirst("^www\\.", "");
            }
        };
    }

    /**
     * A name as a person would want it on a tile: one line, no run of spaces, and cut at a word
     * with an ellipsis rather than mid-word when it runs on. Null when nothing is left.
     */
    public static String tidyName(String raw) {
        if (raw == null) {
            return null;
        }
        String name = raw.replaceAll("\\s+", " ").trim();
        if (name.isEmpty()) {
            return null;
        }
        if (name.length() <= NAME_LENGTH) {
            return name;
        }
        String cut = name.substring(0, NAME_LENGTH - 1);
        int space = cut.lastIndexOf(' ');
        if (space > NAME_LENGTH / 2) {
            cut = cut.substring(0, space);
        }
        return cut.replaceAll("[\\s,;:.\\-–—]+$", "") + "…";
    }

    /**
     * Deletes the pictures among these that nothing shows any more. A saved link's picture moves
     * to the recipe made from it, so it is only deleted once no recipe, photo strip, place or
     * other saved link is using it.
     */
    public static void deleteUnusedImages(JdbcTemplate jdbc, Collection<UUID> imageIds) {
        List<UUID> ids = imageIds.stream().filter(Objects::nonNull).distinct().toList();
        for (UUID id : ids) {
            jdbc.update("DELETE FROM stored_images i WHERE i.id = ?"
                    + " AND NOT EXISTS (SELECT 1 FROM recipes r WHERE r.cover_image_id = i.id)"
                    + " AND NOT EXISTS (SELECT 1 FROM recipe_photos p WHERE p.image_id = i.id)"
                    + " AND NOT EXISTS (SELECT 1 FROM places pl WHERE pl.image_id = i.id)"
                    + " AND NOT EXISTS (SELECT 1 FROM saved_links s WHERE s.cover_image_id = i.id)", id);
        }
    }

    private static String trimSlash(String url) {
        return url != null && url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    private static String hostOf(String url) {
        try {
            String host = URI.create(url).getHost();
            return host == null ? null : host.toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
