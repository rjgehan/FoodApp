package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.IdeaStatus;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.IdeaDtos.IdeaRequest;
import com.gehan.mealplanner.repository.UserRepository;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The ideas board once the beta is over (IDEAS_BOARD=false): /me tells the apps to hide it, and
 * every address answers 404 — even for the admin, and even for an idea that does exist.
 */
@SpringBootTest(properties = "app.ideas.enabled=false")
@Transactional
class IdeasSwitchedOffDatabaseTest {

    @Autowired IdeaService ideaService;
    @Autowired AccountService accountService;
    @Autowired UserRepository userRepository;

    private static void notFound(ThrowingCallable call) {
        assertThatThrownBy(call)
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void theBoardIsNowhereToBeFound() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        User someone = userRepository.save(User.builder().username("ideas-off-" + tag).displayName("Someone").build());
        UUID me = someone.getId();
        UUID idea = UUID.randomUUID();

        assertThat(ideaService.enabled()).isFalse();
        assertThat(accountService.me(me).ideasBoard()).isFalse();

        notFound(() -> ideaService.list(me, "top"));
        notFound(() -> ideaService.create(me, new IdeaRequest("Still here?", null)));
        notFound(() -> ideaService.update(idea, me, new IdeaRequest("Still here?", null)));
        notFound(() -> ideaService.delete(idea, me, true));
        notFound(() -> ideaService.vote(idea, me, true));
        notFound(() -> ideaService.vote(idea, me, false));
        notFound(() -> ideaService.setStatus(idea, me, true, IdeaStatus.DONE));
    }
}
