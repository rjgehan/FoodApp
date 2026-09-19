package com.gehan.mealplanner.service;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WebLinksTest {

    @Test
    void keepsFullLinks() {
        assertThat(WebLinks.normalize(" https://www.tiktok.com/@cook/video/1 ")).isEqualTo("https://www.tiktok.com/@cook/video/1");
        assertThat(WebLinks.normalize("http://example.com/menu")).isEqualTo("http://example.com/menu");
    }

    @Test
    void addsHttpsToWhatPeopleType() {
        assertThat(WebLinks.normalize("tiktok.com/@cook/video/1")).isEqualTo("https://tiktok.com/@cook/video/1");
        assertThat(WebLinks.normalize("www.tonys.com")).isEqualTo("https://www.tonys.com");
        assertThat(WebLinks.normalize("//tonys.com/menu")).isEqualTo("https://tonys.com/menu");
        assertThat(WebLinks.normalize("tonys.com:8080/menu")).isEqualTo("https://tonys.com:8080/menu");
    }

    @Test
    void blankIsNoLink() {
        assertThat(WebLinks.normalize(null)).isNull();
        assertThat(WebLinks.normalize("   ")).isNull();
    }

    @Test
    void refusesAnythingThatIsNotAWebLink() {
        for (String bad : new String[] {"javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,hi", "mailto:a@b.co",
                "not a link", "localhost", "https://"}) {
            assertThatThrownBy(() -> WebLinks.normalize(bad)).as(bad).isInstanceOf(ResponseStatusException.class);
        }
    }
}
