package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.HouseholdMember;
import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.domain.RecipeCategory;
import com.gehan.mealplanner.domain.RecipeFiling;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.AdminDtos.AdminPage;
import com.gehan.mealplanner.dto.AdminDtos.HouseholdDetail;
import com.gehan.mealplanner.dto.AdminDtos.HouseholdMemberRow;
import com.gehan.mealplanner.dto.AdminDtos.HouseholdRecipeRow;
import com.gehan.mealplanner.dto.AdminDtos.HouseholdRow;
import com.gehan.mealplanner.dto.AdminDtos.Overview;
import com.gehan.mealplanner.dto.AdminDtos.RecipeDetail;
import com.gehan.mealplanner.dto.AdminDtos.RecipeRow;
import com.gehan.mealplanner.dto.AdminDtos.UserHousehold;
import com.gehan.mealplanner.dto.AdminDtos.UserRow;
import com.gehan.mealplanner.repository.HouseholdInviteRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The admin pages' reads: every household, account and recipe on the server, whoever's they are.
 * Only ever reached through AdminController, which only an admin gets to (see AdminGate).
 *
 * Nothing here writes. Each list is a handful of queries for the whole page rather than one per
 * row, so a page of fifty recipes is five round trips, not two hundred.
 */
@Service
@Transactional(readOnly = true)
public class AdminService {

    public static final int DEFAULT_PAGE_SIZE = 50;
    public static final int MAX_PAGE_SIZE = 200;

    private final EntityManager em;
    private final HouseholdInviteRepository inviteRepository;
    private final RecipeService recipeService;
    private final AdminAccess adminAccess;

    public AdminService(EntityManager em,
                        HouseholdInviteRepository inviteRepository,
                        RecipeService recipeService,
                        AdminAccess adminAccess) {
        this.em = em;
        this.inviteRepository = inviteRepository;
        this.recipeService = recipeService;
        this.adminAccess = adminAccess;
    }

    // --- Overview ----------------------------------------------------------------------------

    public Overview overview() {
        return new Overview(
                count("select count(u) from User u"),
                count("select count(u) from User u where u.email is not null"),
                count("select count(u) from User u where u.passwordHash is not null"),
                count("select count(u) from User u where u.pinHash is not null"),
                count("select count(h) from Household h"),
                count("select count(r) from Recipe r"),
                count("select count(r) from Recipe r where r.published = true"),
                count("select count(s) from RecipeShare s"),
                count("select count(l) from RecipeLink l"),
                em.createQuery("select count(i) from HouseholdInvite i where i.revokedAt is null and i.expiresAt > :now",
                                Long.class)
                        .setParameter("now", Instant.now())
                        .getSingleResult());
    }

    private long count(String jpql) {
        return em.createQuery(jpql, Long.class).getSingleResult();
    }

    // --- Households --------------------------------------------------------------------------

    /**
     * Sorted and paged here rather than in SQL: a server like this holds tens of houses, and
     * sorting by how many people or recipes each has is then a comparator instead of a query
     * that has to count inside its ORDER BY.
     */
    public AdminPage<HouseholdRow> households(String sort, String dir, Integer page, Integer size) {
        Map<UUID, Long> members = countsBy("select m.household.id, count(m) from HouseholdMember m group by m.household.id");
        Map<UUID, Long> recipes = countsBy("select r.household.id, count(r) from Recipe r group by r.household.id");
        Map<UUID, String> owners = new HashMap<>();
        for (Object[] row : em.createQuery(
                        "select m.household.id, m.user.displayName from HouseholdMember m "
                                + "where m.role = :owner order by m.joinedAt", Object[].class)
                .setParameter("owner", HouseholdRole.OWNER)
                .getResultList()) {
            owners.putIfAbsent((UUID) row[0], (String) row[1]);
        }

        List<HouseholdRow> rows = new ArrayList<>(em.createQuery("select h from Household h", Household.class)
                .getResultList().stream()
                .map(h -> new HouseholdRow(h.getId(), h.getName(), h.getCreatedAt(),
                        members.getOrDefault(h.getId(), 0L), recipes.getOrDefault(h.getId(), 0L),
                        owners.get(h.getId())))
                .toList());

        Comparator<HouseholdRow> byName = Comparator.comparing(r -> r.name().toLowerCase(Locale.ROOT));
        Comparator<HouseholdRow> order = switch (sort == null ? "name" : sort) {
            case "created" -> Comparator.comparing(HouseholdRow::createdAt);
            case "members" -> Comparator.comparingLong(HouseholdRow::memberCount);
            case "recipes" -> Comparator.comparingLong(HouseholdRow::recipeCount);
            case "owner" -> Comparator.comparing(r -> r.ownerName() == null ? "" : r.ownerName().toLowerCase(Locale.ROOT));
            default -> byName;
        };
        if ("desc".equalsIgnoreCase(dir)) {
            order = order.reversed();
        }
        rows.sort(order.thenComparing(byName));

        int p = pageOf(page);
        int s = sizeOf(size);
        int from = (int) Math.min((long) p * s, rows.size());
        int to = Math.min(from + s, rows.size());
        return new AdminPage<>(rows.subList(from, to), p, s, rows.size());
    }

    public HouseholdDetail household(UUID householdId) {
        Household household = em.find(Household.class, householdId);
        if (household == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such household.");
        }

        List<HouseholdMemberRow> members = em.createQuery(
                        "select m from HouseholdMember m join fetch m.user where m.household.id = :id order by m.joinedAt",
                        HouseholdMember.class)
                .setParameter("id", householdId)
                .getResultList().stream()
                .map(m -> {
                    User u = m.getUser();
                    return new HouseholdMemberRow(u.getId(), u.getDisplayName(), u.getUsername(), u.getEmail(),
                            m.getRole(), m.getJoinedAt(), u.getPasswordHash() != null, u.getPinHash() != null,
                            householdId.equals(u.getLastHouseholdId()));
                })
                .toList();

        List<Recipe> own = em.createQuery(
                        "select r from Recipe r where r.household.id = :id order by lower(r.name)", Recipe.class)
                .setParameter("id", householdId)
                .getResultList();
        List<UUID> ids = own.stream().map(Recipe::getId).toList();
        Map<UUID, RecipeFiling> filings = ownFilings(ids);
        Map<UUID, List<String>> shares = sharedWith(ids);
        Set<UUID> publicLinks = withPublicLinks(ids);
        List<HouseholdRecipeRow> recipes = own.stream()
                .map(r -> new HouseholdRecipeRow(r.getId(), r.getName(), sectionOf(filings.get(r.getId())),
                        r.getCreatedAt(), r.isPublished(), shares.getOrDefault(r.getId(), List.of()),
                        publicLinks.contains(r.getId())))
                .toList();

        Instant now = Instant.now();
        boolean inviteLive = inviteRepository.findByHouseholdIdAndRevokedAtIsNull(householdId).stream()
                .anyMatch(i -> i.isLive(now));

        return new HouseholdDetail(household.getId(), household.getName(), household.getCreatedAt(),
                household.getDefaultServings(), household.getPlanningHorizonDays(), inviteLive, members, recipes);
    }

    // --- People ------------------------------------------------------------------------------

    /** Everybody with an account, in no house as well as in several. `q` matches name, username or email. */
    public AdminPage<UserRow> users(String q, Integer page, Integer size) {
        String like = likePattern(q);
        String where = like == null ? ""
                : " where lower(u.displayName) like :q escape '\\' or lower(u.username) like :q escape '\\'"
                        + " or lower(coalesce(u.email, '')) like :q escape '\\'";
        TypedQuery<Long> total = em.createQuery("select count(u) from User u" + where, Long.class);
        TypedQuery<User> rows = em.createQuery(
                "select u from User u" + where + " order by lower(u.displayName), u.createdAt, u.id", User.class);
        if (like != null) {
            total.setParameter("q", like);
            rows.setParameter("q", like);
        }
        int p = pageOf(page);
        int s = sizeOf(size);
        List<User> users = rows.setFirstResult(p * s).setMaxResults(s).getResultList();

        Map<UUID, List<UserHousehold>> households = new HashMap<>();
        if (!users.isEmpty()) {
            for (HouseholdMember m : em.createQuery(
                            "select m from HouseholdMember m join fetch m.household where m.user.id in :ids order by m.joinedAt",
                            HouseholdMember.class)
                    .setParameter("ids", users.stream().map(User::getId).toList())
                    .getResultList()) {
                households.computeIfAbsent(m.getUser().getId(), k -> new ArrayList<>())
                        .add(new UserHousehold(m.getHousehold().getId(), m.getHousehold().getName(), m.getRole()));
            }
        }

        List<UserRow> items = users.stream()
                .map(u -> new UserRow(u.getId(), u.getDisplayName(), u.getUsername(), u.getEmail(),
                        u.getPasswordHash() != null, u.getPinHash() != null, adminAccess.isAdmin(u), u.getCreatedAt(),
                        households.getOrDefault(u.getId(), List.of())))
                .toList();
        return new AdminPage<>(items, p, s, total.getSingleResult());
    }

    // --- Recipes -----------------------------------------------------------------------------

    /** Every house's recipes, newest first, narrowed by name and by house. */
    public AdminPage<RecipeRow> recipes(String q, UUID householdId, Integer page, Integer size) {
        String like = likePattern(q);
        List<String> conditions = new ArrayList<>();
        if (like != null) {
            conditions.add("lower(r.name) like :q escape '\\'");
        }
        if (householdId != null) {
            conditions.add("r.household.id = :household");
        }
        String where = conditions.isEmpty() ? "" : " where " + String.join(" and ", conditions);

        TypedQuery<Long> total = em.createQuery("select count(r) from Recipe r" + where, Long.class);
        TypedQuery<Recipe> rows = em.createQuery(
                "select r from Recipe r join fetch r.household" + where + " order by r.createdAt desc, r.id", Recipe.class);
        if (like != null) {
            total.setParameter("q", like);
            rows.setParameter("q", like);
        }
        if (householdId != null) {
            total.setParameter("household", householdId);
            rows.setParameter("household", householdId);
        }
        int p = pageOf(page);
        int s = sizeOf(size);
        List<Recipe> recipes = rows.setFirstResult(p * s).setMaxResults(s).getResultList();

        List<UUID> ids = recipes.stream().map(Recipe::getId).toList();
        Map<UUID, RecipeFiling> filings = ownFilings(ids);
        Map<UUID, List<String>> shares = sharedWith(ids);
        Set<UUID> publicLinks = withPublicLinks(ids);
        Map<UUID, Long> linkCounts = ids.isEmpty() ? Map.of() : countsBy(
                "select l.recipe.id, count(l) from RecipeSourceLink l where l.recipe.id in :ids group by l.recipe.id",
                ids);

        List<RecipeRow> items = recipes.stream()
                .map(r -> {
                    RecipeFiling filing = filings.get(r.getId());
                    List<String> groups = filing == null ? List.of() : filing.getCategories().stream()
                            .map(RecipeCategory::getName)
                            .sorted(String.CASE_INSENSITIVE_ORDER)
                            .toList();
                    return new RecipeRow(r.getId(), r.getName(), r.getHousehold().getId(), r.getHousehold().getName(),
                            sectionOf(filing), groups, r.getCreatedAt(), r.isPublished(),
                            shares.getOrDefault(r.getId(), List.of()),
                            linkCounts.getOrDefault(r.getId(), 0L).intValue(), publicLinks.contains(r.getId()));
                })
                .toList();
        return new AdminPage<>(items, p, s, total.getSingleResult());
    }

    public RecipeDetail recipe(UUID recipeId) {
        Recipe recipe = em.find(Recipe.class, recipeId);
        if (recipe == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such recipe.");
        }
        List<UUID> ids = List.of(recipeId);
        return new RecipeDetail(recipeService.asItsHouseholdSeesIt(recipe), recipe.getHousehold().getName(),
                recipe.getCreatedAt(), sharedWith(ids).getOrDefault(recipeId, List.of()),
                withPublicLinks(ids).contains(recipeId));
    }

    // --- Pieces ------------------------------------------------------------------------------

    /** Where each recipe's own house filed it — the drawer and groups its owners see it under. */
    private Map<UUID, RecipeFiling> ownFilings(Collection<UUID> recipeIds) {
        if (recipeIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, RecipeFiling> filings = new HashMap<>();
        for (RecipeFiling f : em.createQuery(
                        "select distinct f from RecipeFiling f left join fetch f.categories "
                                + "where f.recipe.id in :ids and f.household.id = f.recipe.household.id",
                        RecipeFiling.class)
                .setParameter("ids", recipeIds)
                .getResultList()) {
            filings.put(f.getRecipe().getId(), f);
        }
        return filings;
    }

    /** The names of the houses each recipe is shared with, alphabetically. */
    private Map<UUID, List<String>> sharedWith(Collection<UUID> recipeIds) {
        if (recipeIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, List<String>> names = new LinkedHashMap<>();
        for (Object[] row : em.createQuery(
                        "select s.recipe.id, s.household.name from RecipeShare s where s.recipe.id in :ids "
                                + "order by lower(s.household.name)", Object[].class)
                .setParameter("ids", recipeIds)
                .getResultList()) {
            names.computeIfAbsent((UUID) row[0], k -> new ArrayList<>()).add((String) row[1]);
        }
        return names;
    }

    /** Which of these recipes have a public link. Whether, not what: the token is the key to it. */
    private Set<UUID> withPublicLinks(Collection<UUID> recipeIds) {
        if (recipeIds.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(em.createQuery("select l.recipe.id from RecipeLink l where l.recipe.id in :ids", UUID.class)
                .setParameter("ids", recipeIds)
                .getResultList());
    }

    private Map<UUID, Long> countsBy(String jpql) {
        return toCounts(em.createQuery(jpql, Object[].class).getResultList());
    }

    private Map<UUID, Long> countsBy(String jpql, Collection<UUID> ids) {
        return toCounts(em.createQuery(jpql, Object[].class).setParameter("ids", ids).getResultList());
    }

    private static Map<UUID, Long> toCounts(List<Object[]> rows) {
        Map<UUID, Long> counts = new HashMap<>();
        for (Object[] row : rows) {
            counts.put((UUID) row[0], (Long) row[1]);
        }
        return counts;
    }

    private static RecipeSection sectionOf(RecipeFiling filing) {
        return filing == null ? null : filing.getSection();
    }

    /** "%text%", lowercased, with the characters LIKE treats as wildcards taken literally. Null for no search. */
    static String likePattern(String q) {
        if (q == null || q.isBlank()) {
            return null;
        }
        String escaped = q.trim().toLowerCase(Locale.ROOT)
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }

    /** Capped so page × size cannot overflow into a negative offset. */
    private static int pageOf(Integer page) {
        return page == null || page < 0 ? 0 : Math.min(page, 100_000);
    }

    private static int sizeOf(Integer size) {
        if (size == null || size < 1) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(size, MAX_PAGE_SIZE);
    }
}
