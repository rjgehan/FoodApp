package com.gehan.mealplanner.service;

import com.gehan.mealplanner.config.StartupBackfills;
import com.gehan.mealplanner.domain.HouseholdMember;
import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.CupboardDtos.AddCupboardItemRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.HouseholdResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.UpdateKitchenRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The kitchen against the real database: what a new household starts with, the settings any
 * member can change, the old households the backfill decides a cupboard for, and a deleted
 * household taking its machines with it. Rolled back after each test.
 */
@SpringBootTest
@Transactional
class KitchenDatabaseTest {

    @Autowired HouseholdService householdService;
    @Autowired RecipeService recipeService;
    @Autowired CupboardService cupboardService;
    @Autowired HouseholdRepository householdRepository;
    @Autowired HouseholdMemberRepository memberRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager entityManager;
    @Autowired JsonMapper jsonMapper;

    private UUID me;
    private UUID home;

    @BeforeEach
    void household() {
        me = userRepository.save(User.builder()
                .username("kitchen-it-" + UUID.randomUUID()).displayName("Kitchen").build()).getId();
        home = householdService.create(me, new CreateHouseholdRequest("Kitchen IT")).id();
    }

    @Test
    void aNewHouseholdStartsWithTheListAndThePlanAndNoCupboard() {
        HouseholdResponse made = householdService.create(me, new CreateHouseholdRequest("Fresh"));

        assertThat(made.cupboardEnabled()).isFalse();
        assertThat(made.planEnabled()).isTrue();
        assertThat(made.machines()).isEmpty();
        assertThat(made.kitchenSetUp()).isFalse();
        // And it reads back the same, not just on the way out of create.
        assertThat(mine()).extracting(HouseholdResponse::cupboardEnabled, HouseholdResponse::planEnabled,
                HouseholdResponse::kitchenSetUp).containsExactly(false, true, false);
    }

    @Test
    void onlyWhatIsSentChanges() {
        HouseholdResponse machines = kitchen(new UpdateKitchenRequest(null, null, List.of("blender", "oven"), null));
        // In the catalogue's order, whatever order they were sent in.
        assertThat(machines.machines()).containsExactly("oven", "blender");
        assertThat(machines.cupboardEnabled()).isFalse();
        assertThat(machines.planEnabled()).isTrue();

        HouseholdResponse cupboard = kitchen(new UpdateKitchenRequest(true, false, null, null));
        assertThat(cupboard.cupboardEnabled()).isTrue();
        assertThat(cupboard.planEnabled()).isFalse();
        assertThat(cupboard.machines()).containsExactly("oven", "blender");
        assertThat(cupboard.kitchenSetUp()).isFalse();

        HouseholdResponse nothing = kitchen(new UpdateKitchenRequest(null, null, null, null));
        assertThat(nothing).isEqualTo(cupboard);
    }

    @Test
    void machinesReplaceTheWholeList() {
        kitchen(new UpdateKitchenRequest(null, null, List.of("oven", "stovetop", "blender"), null));

        assertThat(kitchen(new UpdateKitchenRequest(null, null, List.of("air-fryer", "oven", "oven"), null)).machines())
                .containsExactly("oven", "air-fryer");
        entityManager.flush();
        entityManager.clear();
        assertThat(mine().machines()).containsExactly("oven", "air-fryer");

        assertThat(kitchen(new UpdateKitchenRequest(null, null, List.of(), null)).machines()).isEmpty();
    }

    @Test
    void aMachineTheServerHasNeverHeardOfIsRefusedAndNothingChanges() {
        assertThatThrownBy(() -> kitchen(new UpdateKitchenRequest(true, null, List.of("oven", "toaster"), true)))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode().value()).isEqualTo(400);
                    assertThat(e.getReason()).isEqualTo("There's no machine called toaster.");
                });

        HouseholdResponse after = mine();
        assertThat(after.cupboardEnabled()).isFalse();
        assertThat(after.machines()).isEmpty();
        assertThat(after.kitchenSetUp()).isFalse();
    }

    @Test
    void setUpIsStampedOnceAndFalseAsksTheQuestionsAgain() {
        assertThat(kitchen(new UpdateKitchenRequest(null, null, null, true)).kitchenSetUp()).isTrue();
        Instant first = householdRepository.findById(home).orElseThrow().getKitchenSetUpAt();
        assertThat(first).isNotNull();

        // Answering again — the settings screen, a second phone — keeps the first answer's date.
        kitchen(new UpdateKitchenRequest(null, null, List.of("oven"), true));
        assertThat(householdRepository.findById(home).orElseThrow().getKitchenSetUpAt()).isEqualTo(first);

        assertThat(kitchen(new UpdateKitchenRequest(null, null, null, false)).kitchenSetUp()).isFalse();
        assertThat(householdRepository.findById(home).orElseThrow().getKitchenSetUpAt()).isNull();
    }

    @Test
    void anyMemberMayChangeTheKitchenButNobodyElse() {
        User member = userRepository.save(User.builder()
                .username("kitchen-member-" + UUID.randomUUID()).displayName("Member").build());
        memberRepository.save(HouseholdMember.builder()
                .household(householdRepository.findById(home).orElseThrow())
                .user(member)
                .role(HouseholdRole.MEMBER)
                .build());
        HouseholdResponse theirs = householdService.updateKitchen(home, member.getId(),
                new UpdateKitchenRequest(true, null, List.of("slow-cooker"), true));
        assertThat(theirs.role()).isEqualTo(HouseholdRole.MEMBER);
        assertThat(theirs.cupboardEnabled()).isTrue();
        assertThat(theirs.machines()).containsExactly("slow-cooker");

        UUID stranger = userRepository.save(User.builder()
                .username("kitchen-stranger-" + UUID.randomUUID()).displayName("Stranger").build()).getId();
        assertThatThrownBy(() -> householdService.updateKitchen(home, stranger,
                new UpdateKitchenRequest(false, null, null, null)))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode().value()).isEqualTo(403));
    }

    @Test
    void theBodyTheAppsSendReadsAsMeant() throws Exception {
        UpdateKitchenRequest sent = jsonMapper.readValue(
                "{\"machines\":[\"oven\",\"air-fryer\"],\"planEnabled\":false,\"setUp\":true}",
                UpdateKitchenRequest.class);
        assertThat(sent).isEqualTo(new UpdateKitchenRequest(null, false, List.of("oven", "air-fryer"), true));

        // And the catalogue goes out as key and label.
        assertThat(jsonMapper.writeValueAsString(KitchenMachines.ALL.get(3)))
                .isEqualTo("{\"key\":\"air-fryer\",\"label\":\"Air fryer\"}");
    }

    @Test
    void aHouseholdFromBeforeTheChoiceKeepsItsCupboardOnlyIfItUsedIt() {
        UUID stocked = householdService.create(me, new CreateHouseholdRequest("Stocked")).id();
        cupboardService.add(stocked, me, new AddCupboardItemRequest("rice-" + UUID.randomUUID(), false));
        UUID bare = householdService.create(me, new CreateHouseholdRequest("Bare")).id();
        entityManager.flush();
        jdbc.update("UPDATE households SET cupboard_enabled = NULL WHERE id IN (?, ?)", stocked, bare);
        entityManager.clear();

        // Until the backfill has looked, nothing it had goes missing.
        assertThat(householdService.responseFor(bare, me).cupboardEnabled()).isTrue();

        assertThat(StartupBackfills.decideCupboards(jdbc)).isGreaterThanOrEqualTo(2);
        entityManager.clear();

        assertThat(householdService.responseFor(stocked, me).cupboardEnabled()).isTrue();
        assertThat(householdService.responseFor(bare, me).cupboardEnabled()).isFalse();
        // Decided once: a household made since, or decided before, is never looked at again.
        assertThat(householdService.responseFor(home, me).cupboardEnabled()).isFalse();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM households WHERE id IN (?, ?, ?) AND cupboard_enabled IS NULL",
                Long.class, stocked, bare, home)).isZero();
    }

    @Test
    void deletingAHouseholdTakesItsMachinesAndItsRecipesMachines() {
        kitchen(new UpdateKitchenRequest(null, null, List.of("oven", "blender"), null));
        UUID recipe = recipeService.create(home, me, new RecipeRequest("Soup", null, "Blend until smooth.", null,
                null, 4, null, null, null, RecipeSection.DINNER, List.of(), null, null,
                List.of(new RecipeIngredientRequest("leek", BigDecimal.ONE, null, null, false)))).id();
        entityManager.flush();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM recipe_appliances WHERE recipe_id = ?", Long.class, recipe))
                .isEqualTo(1);

        householdService.delete(home, me);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM household_machines WHERE household_id = ?", Long.class, home))
                .isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM recipe_appliances WHERE recipe_id = ?", Long.class, recipe))
                .isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM households WHERE id = ?", Long.class, home)).isZero();
    }

    private HouseholdResponse kitchen(UpdateKitchenRequest request) {
        return householdService.updateKitchen(home, me, request);
    }

    private HouseholdResponse mine() {
        return householdService.listForUser(me).stream().filter(h -> h.id().equals(home)).findFirst().orElseThrow();
    }
}
