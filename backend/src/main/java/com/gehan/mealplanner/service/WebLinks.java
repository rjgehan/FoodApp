package com.gehan.mealplanner.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.regex.Pattern;

/**
 * Links people paste or type — a recipe's video, a restaurant's menu. They end up as an href, so
 * only http(s) gets through: a javascript: url would be a script injection on everyone who opens
 * the page, including households a recipe was shared with.
 *
 * People type "tiktok.com/@cook/…" rather than the full thing, so a bare address gets https://
 * put in front instead of being refused.
 */
final class WebLinks {

    /** Something with a scheme already — "https:", "javascript:", "mailto:". */
    private static final Pattern HAS_SCHEME = Pattern.compile("^[a-zA-Z][a-zA-Z0-9+.-]*:(?!\\d)");

    private WebLinks() {
    }

    static String normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String link = raw.trim();
        if (!HAS_SCHEME.matcher(link).find()) {
            link = "https://" + link.replaceFirst("^/+", "");
        }
        URI uri;
        try {
            uri = new URI(link);
        } catch (URISyntaxException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That doesn't look like a link.");
        }
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Links must start with http:// or https://");
        }
        if (uri.getHost() == null || !uri.getHost().contains(".")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That doesn't look like a link.");
        }
        return link;
    }
}
