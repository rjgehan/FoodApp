package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.User;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The admin rule on its own: an email on one list and a username on the other, both or nothing. */
class AdminAccessTest {

    private final AdminAccess access = new AdminAccess(" Boss@Example.com , second@example.com,", "ryan, ,other", null);

    private static User user(String username, String email) {
        return User.builder().username(username).displayName(username).email(email).build();
    }

    @Test
    void needsBothTheEmailAndTheUsername() {
        assertThat(access.isAdmin(user("ryan", "boss@example.com"))).isTrue();
        // The address alone: somebody who typed it in first is not the admin.
        assertThat(access.isAdmin(user("mallory", "boss@example.com"))).isFalse();
        // The username alone: no address, or somebody else's.
        assertThat(access.isAdmin(user("ryan", null))).isFalse();
        assertThat(access.isAdmin(user("ryan", "ryan@example.com"))).isFalse();
    }

    @Test
    void comparesBothIgnoringCaseAndSpaces() {
        assertThat(access.isAdmin(user("Ryan", "BOSS@example.COM"))).isTrue();
        assertThat(access.isAdminEmail(" second@EXAMPLE.com ")).isTrue();
        assertThat(access.isAdminUsername("OTHER")).isTrue();
        assertThat(access.isAdminUsername("")).isFalse();
    }

    @Test
    void emptyConfigMeansNobody() {
        AdminAccess none = new AdminAccess("", "", null);
        assertThat(none.isAdmin(user("ryan", "boss@example.com"))).isFalse();
        assertThat(none.isAdminEmail("boss@example.com")).isFalse();
        assertThat(none.isAdminUsername("")).isFalse();
        assertThat(new AdminAccess(null, null, null).isAdmin(user("ryan", "boss@example.com"))).isFalse();
        assertThat(none.isAdmin((User) null)).isFalse();
    }

    @Test
    void searchTextIsTakenLiterally() {
        assertThat(AdminService.likePattern("  ")).isNull();
        assertThat(AdminService.likePattern("50% Off_Pie")).isEqualTo("%50\\% off\\_pie%");
    }
}
