package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.HouseholdMember;
import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.AdminDtos.HouseholdDetail;
import com.gehan.mealplanner.dto.AdminDtos.RecipeRow;
import com.gehan.mealplanner.dto.AdminDtos.UserRow;
import com.gehan.mealplanner.dto.AuthDtos.SignupRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CredentialsRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.UpdateProfileRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.UserRepository;
import com.gehan.mealplanner.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The admin rule against the real database, with an admin configured: who counts, that the
 * admin's address cannot be put on anybody else's account by any route, and that the admin's
 * lists reach every house. Rolled back after each test.
 */
@SpringBootTest(properties = {
        "app.admin.emails=boss@admin-it.example",
        "app.admin.usernames=admin-it-boss",
})
@Transactional
class AdminDatabaseTest {

    private static final String ADMIN_EMAIL = "boss@admin-it.example";
    private static final String ADMIN_USERNAME = "admin-it-boss";

    @Autowired AccountService accountService;
    @Autowired HouseholdService householdService;
    @Autowired InviteService inviteService;
    @Autowired RecipeService recipeService;
    @Autowired AdminService adminService;
    @Autowired AdminAccess adminAccess;
    @Autowired UserRepository userRepository;
    @Autowired HouseholdRepository householdRepository;
    @Autowired HouseholdMemberRepository memberRepository;
    @Autowired JwtService jwtService;

    private String tag;

    @BeforeEach
    void tag() {
        tag = UUID.randomUUID().toString().substring(0, 8);
    }

    private User account(String username) {
        return userRepository.save(User.builder().username(username).displayName(username).build());
    }

    @Test
    void theAdminUsernameCanClaimTheAddressAndIsThenTheAdmin() {
        User boss = account(ADMIN_USERNAME);
        assertThat(accountService.me(boss.getId()).admin()).isFalse();

        accountService.updateCredentials(boss.getId(), new CredentialsRequest(" Boss@Admin-IT.example ", "boss-password", null));

        assertThat(accountService.me(boss.getId()).admin()).isTrue();
        assertThat(adminAccess.isAdmin(boss.getId())).isTrue();
    }

    @Test
    void onlyASessionThatBeganWithAPasswordOpensTheAdminPages() {
        User boss = account(ADMIN_USERNAME);
        accountService.updateCredentials(boss.getId(), new CredentialsRequest(ADMIN_EMAIL, "boss-password", null));

        // The token remembers how the session began, and an old token that never said counts as a PIN one.
        assertThat(jwtService.signedInWithPassword(jwtService.generateToken(boss.getId(), ADMIN_USERNAME, true))).isTrue();
        assertThat(jwtService.signedInWithPassword(jwtService.generateToken(boss.getId(), ADMIN_USERNAME, false))).isFalse();

        var byPassword = new UsernamePasswordAuthenticationToken(boss.getId(), null,
                List.of(new SimpleGrantedAuthority(JwtService.PASSWORD_SESSION)));
        var byPin = new UsernamePasswordAuthenticationToken(boss.getId(), null, List.of());
        assertThat(adminAccess.isAdmin(byPassword)).isTrue();
        assertThat(adminAccess.isAdmin(byPin)).isFalse();
        assertThat(adminAccess.isAdmin((Authentication) null)).isFalse();

        // And /me does not offer a PIN session the way in.
        assertThat(accountService.me(boss.getId()).forSession(true).admin()).isTrue();
        assertThat(accountService.me(boss.getId()).forSession(false).admin()).isFalse();
    }

    @Test
    void nobodyCanHandOutAResetLinkForTheAdminsAccount() {
        User owner = account("admin-it-house-owner-" + tag);
        UUID householdId = householdService.create(owner.getId(), new CreateHouseholdRequest("Admin reset IT")).id();
        // An account the house made, the kind an owner may otherwise reset — but it is the admin's.
        User boss = account(ADMIN_USERNAME);
        memberRepository.save(HouseholdMember.builder()
                .household(householdRepository.findById(householdId).orElseThrow())
                .user(boss)
                .role(HouseholdRole.MEMBER)
                .build());

        assertThatThrownBy(() -> accountService.createPasswordReset(householdId, owner.getId(), boss.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void anybodyElseClaimingTheAdminAddressIsRefused() {
        User stranger = account("admin-it-stranger-" + tag);

        assertThatThrownBy(() -> accountService.updateCredentials(stranger.getId(),
                new CredentialsRequest(ADMIN_EMAIL.toUpperCase(), "stranger-password", null)))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> {
                    ResponseStatusException rse = (ResponseStatusException) e;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(rse.getReason()).isEqualTo(AdminAccess.EMAIL_RESERVED);
                });
        assertThat(userRepository.findById(stranger.getId()).orElseThrow().getEmail()).isNull();
        assertThat(accountService.me(stranger.getId()).admin()).isFalse();
    }

    @Test
    void signingUpWithTheAdminAddressIsRefused() {
        User owner = account("admin-it-owner-" + tag);
        UUID householdId = householdService.create(owner.getId(), new CreateHouseholdRequest("Admin IT")).id();
        String token = inviteService.getOrCreate(householdId, owner.getId()).token();

        // "boss@…" would become the username "boss" — not the admin's, so the address stays theirs.
        assertThatThrownBy(() -> inviteService.signUp(new SignupRequest(token, "Boss", ADMIN_EMAIL, "boss-password")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void theAdminUsernameCannotBePickedUpByRenamingOrSigningUp() {
        User stranger = account("admin-it-renamer-" + tag);
        assertThatThrownBy(() -> householdService.updateProfile(stranger.getId(),
                new UpdateProfileRequest("Admin-IT-Boss", null)))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);

        // Nobody holds it yet, and still a sign-up whose address starts with it is numbered past it.
        assertThat(userRepository.existsByUsernameIgnoreCase(ADMIN_USERNAME)).isFalse();
        assertThat(accountService.usernameFromEmail(ADMIN_USERNAME + "@elsewhere.example"))
                .isEqualTo(ADMIN_USERNAME + "2");
    }

    @Test
    void anAdminWhoRenamesThemselvesStopsBeingTheAdmin() {
        User boss = account(ADMIN_USERNAME);
        accountService.updateCredentials(boss.getId(), new CredentialsRequest(ADMIN_EMAIL, "boss-password", null));
        householdService.updateProfile(boss.getId(), new UpdateProfileRequest("admin-it-former-" + tag, null));
        assertThat(accountService.me(boss.getId()).admin()).isFalse();
    }

    @Test
    void theListsReachEveryHouseAndAccount() {
        User owner = account("admin-it-cook-" + tag);
        owner.setDisplayName("Cook " + tag);
        UUID householdId = householdService.create(owner.getId(), new CreateHouseholdRequest("Admin IT " + tag)).id();
        User loner = account("admin-it-loner-" + tag);
        RecipeResponse recipe = recipeService.create(householdId, owner.getId(), new RecipeRequest(
                "Pie " + tag, null, "Bake it.", null, null, 4, null, null, null, RecipeSection.DINNER,
                List.of("Full meal"), null, null, List.of()));

        HouseholdDetail detail = adminService.household(householdId);
        assertThat(detail.name()).isEqualTo("Admin IT " + tag);
        assertThat(detail.members()).singleElement().satisfies(m -> {
            assertThat(m.username()).isEqualTo(owner.getUsername());
            assertThat(m.lastHousehold()).isFalse();
        });
        assertThat(detail.recipes()).singleElement().satisfies(r -> {
            assertThat(r.name()).isEqualTo("Pie " + tag);
            assertThat(r.section()).isEqualTo(RecipeSection.DINNER);
        });

        // Somebody in no house at all still shows up.
        List<UserRow> people = adminService.users(tag, 0, 50).items();
        assertThat(people).extracting(UserRow::username).contains(owner.getUsername(), loner.getUsername());
        assertThat(people).filteredOn(u -> u.userId().equals(loner.getId())).singleElement()
                .satisfies(u -> assertThat(u.households()).isEmpty());

        List<RecipeRow> found = adminService.recipes("pie " + tag, householdId, 0, 10).items();
        assertThat(found).singleElement().satisfies(r -> {
            assertThat(r.id()).isEqualTo(recipe.id());
            assertThat(r.householdName()).isEqualTo("Admin IT " + tag);
            assertThat(r.groups()).containsExactly("Full meal");
        });
        assertThat(adminService.recipe(recipe.id()).recipe().instructions()).isEqualTo("Bake it.");
        assertThat(adminService.recipes("nothing-called-this-" + tag, null, 0, 10).total()).isZero();
    }
}
