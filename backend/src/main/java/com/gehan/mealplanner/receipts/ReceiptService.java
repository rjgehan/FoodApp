package com.gehan.mealplanner.receipts;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.GroceryListDtos.LastPrice;
import com.gehan.mealplanner.receipts.ReceiptDtos.DraftLine;
import com.gehan.mealplanner.receipts.ReceiptDtos.LinkPlaceRequest;
import com.gehan.mealplanner.receipts.ReceiptDtos.PlaceDto;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReadReceiptRequest;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptDraft;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptLineResponse;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptResponse;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptSummary;
import com.gehan.mealplanner.receipts.ReceiptDtos.SaveLine;
import com.gehan.mealplanner.receipts.ReceiptDtos.SaveReceiptRequest;
import com.gehan.mealplanner.receipts.ReceiptDtos.StoreItemPrice;
import com.gehan.mealplanner.receipts.ReceiptDtos.StorePrices;
import com.gehan.mealplanner.receipts.ReceiptDtos.StoreResponse;
import com.gehan.mealplanner.receipts.ReceiptReader.KnownIngredient;
import com.gehan.mealplanner.receipts.ReceiptReader.KnownStore;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.IngredientRepository;
import com.gehan.mealplanner.repository.StoredImageRepository;
import com.gehan.mealplanner.repository.UserRepository;
import com.gehan.mealplanner.service.GroceryListService;
import com.gehan.mealplanner.service.HouseholdService;
import com.gehan.mealplanner.service.IngredientService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Receipts, from the text the phone read off one to the prices it teaches the grocery list.
 *
 * Reading saves nothing: the phone shows what {@link ReceiptReader} made of the text, somebody
 * puts it right, and only what they confirm is saved. Each confirmed line that counts as an
 * ingredient becomes a {@link PriceObservation}, and the grocery rows for those things go out to
 * every open phone again so they show the new price.
 *
 * Saving and deleting take the household's lock, like everything that writes its list: a receipt
 * saved twice at once (a double tap) has the second find the first by its barcode and refuse,
 * and two receipts naming a new shop make it once.
 */
@Service
public class ReceiptService {

    private final ReceiptRepository receiptRepository;
    private final PriceObservationRepository priceObservationRepository;
    private final StoreRepository storeRepository;
    private final HouseholdRepository householdRepository;
    private final IngredientRepository ingredientRepository;
    private final UserRepository userRepository;
    private final HouseholdService householdService;
    private final IngredientService ingredientService;
    private final GroceryListService groceryListService;
    private final Stores stores;
    private final Prices prices;
    private final JdbcTemplate jdbc;
    private final StoredImageRepository imageRepository;

    public ReceiptService(ReceiptRepository receiptRepository,
                          PriceObservationRepository priceObservationRepository,
                          StoreRepository storeRepository,
                          HouseholdRepository householdRepository,
                          IngredientRepository ingredientRepository,
                          UserRepository userRepository,
                          HouseholdService householdService,
                          IngredientService ingredientService,
                          GroceryListService groceryListService,
                          Stores stores,
                          Prices prices,
                          JdbcTemplate jdbc,
                          StoredImageRepository imageRepository) {
        this.receiptRepository = receiptRepository;
        this.priceObservationRepository = priceObservationRepository;
        this.storeRepository = storeRepository;
        this.householdRepository = householdRepository;
        this.ingredientRepository = ingredientRepository;
        this.userRepository = userRepository;
        this.householdService = householdService;
        this.ingredientService = ingredientService;
        this.groceryListService = groceryListService;
        this.stores = stores;
        this.prices = prices;
        this.jdbc = jdbc;
        this.imageRepository = imageRepository;
    }

    /**
     * What the receipt says, as a draft to check. The ingredient guesses come from the household's
     * own: what is on its list (ticked rows too — those are what was just bought), in its recipes,
     * and what it has priced before. `duplicateOf` is a receipt already saved with this barcode.
     */
    @Transactional(readOnly = true)
    public ReceiptDraft read(UUID householdId, UUID requesterId, ReadReceiptRequest request) {
        householdService.assertMember(householdId, requesterId);
        List<KnownStore> known = storeRepository.findByHouseholdIdOrderByNameAsc(householdId).stream()
                .map(s -> new KnownStore(s.getId(), s.getName()))
                .toList();
        // What each line is, best evidence first: the household's own list, then what was said about
        // the same printed line before, then — only for a gap — what anybody has priced.
        ReceiptDraft draft = guessedFromOthers(remembered(householdId,
                ReceiptReader.read(request.lines(), knownIngredients(householdId), known)));
        String barcode = blankToNull(request.barcode());
        if (barcode == null) {
            return draft;
        }
        return receiptRepository.findFirstByHouseholdIdAndBarcode(householdId, barcode)
                .map(saved -> draft.withDuplicateOf(saved.getId()))
                .orElse(draft);
    }

    /**
     * What somebody said about the same line on an earlier receipt — its brand, its size, what it
     * counts as — put on this one, so "TWININGS ENG BRKFST 20CT" is Twinings english breakfast
     * tea, 20 bags, the second time without anybody saying so again. Matched on the line's words
     * as printed, whatever their case: this household's own receipts first, then anybody's on the
     * server, since one shop's receipts say the same thing to everyone. Newest wins.
     *
     * A size somebody gave beats one read off the name ("20CT" said as 20 bags), but never a
     * weight or a count the receipt printed: those are this shop's, not last time's. What another
     * household said a line counts as only fills a gap: this household's own list knows better
     * what it calls things ("baby spinach", not their "spinach").
     */
    private ReceiptDraft remembered(UUID householdId, ReceiptDraft draft) {
        List<String> said = draft.lines().stream()
                .filter(l -> ReceiptLine.ITEM.equals(l.kind()) && l.text() != null && !l.text().isBlank())
                .map(l -> l.text().trim().toUpperCase(Locale.ROOT))
                .distinct()
                .toList();
        if (said.isEmpty()) {
            return draft;
        }
        record Said(String brand, BigDecimal quantity, String unit, boolean measured, UUID ingredientId, String ingredientName,
                    boolean ours) {
        }
        Map<String, Said> before = new HashMap<>();
        String places = String.join(", ", Collections.nCopies(said.size(), "?"));
        List<Object> args = new ArrayList<>();
        args.add(householdId);
        args.addAll(said);
        args.add(householdId);
        jdbc.query("""
                SELECT DISTINCT ON (upper(rl.text))
                       upper(rl.text) AS said, rl.brand, rl.quantity, rl.unit, rl.unit_price,
                       rl.ingredient_id, i.name AS ingredient_name, r.household_id = ? AS ours
                FROM receipt_lines rl
                JOIN receipts r ON r.id = rl.receipt_id
                LEFT JOIN ingredients i ON i.id = rl.ingredient_id
                WHERE rl.kind = 'ITEM' AND upper(rl.text) IN (%s)
                  AND (rl.brand IS NOT NULL OR rl.ingredient_id IS NOT NULL)
                ORDER BY upper(rl.text), (r.household_id = ?) DESC, r.created_at DESC
                """.formatted(places), rs -> {
            before.put(rs.getString("said"), new Said(
                    rs.getString("brand"),
                    rs.getBigDecimal("quantity"),
                    rs.getString("unit"),
                    rs.getBigDecimal("unit_price") != null,
                    rs.getObject("ingredient_id", UUID.class),
                    rs.getString("ingredient_name"),
                    rs.getBoolean("ours")));
        }, args.toArray());
        if (before.isEmpty()) {
            return draft;
        }
        List<DraftLine> lines = draft.lines().stream()
                .map(line -> {
                    Said last = line.text() == null ? null : before.get(line.text().trim().toUpperCase(Locale.ROOT));
                    if (last == null || !ReceiptLine.ITEM.equals(line.kind())) {
                        return line;
                    }
                    boolean printed = line.unitPrice() != null;
                    boolean takeSize = !printed && !last.measured() && last.quantity() != null;
                    boolean takeIngredient = last.ingredientId() != null && (last.ours() || line.ingredientId() == null);
                    return new DraftLine(line.text(), line.kind(),
                            takeSize ? last.quantity() : line.quantity(),
                            takeSize ? last.unit() : line.unit(),
                            line.unitPrice(), line.price(), line.onSale(),
                            takeIngredient ? last.ingredientId() : line.ingredientId(),
                            takeIngredient ? last.ingredientName() : line.ingredientName(),
                            line.brand() != null ? line.brand() : last.brand());
                })
                .toList();
        return new ReceiptDraft(draft.storeName(), draft.storeId(), draft.purchasedOn(), draft.subtotal(), draft.tax(),
                draft.total(), draft.sumMatches(), draft.duplicateOf(), lines, draft.unreadLines());
    }

    /** A line nothing has said anything about yet: a guess from what anybody on the server has priced. */
    private ReceiptDraft guessedFromOthers(ReceiptDraft draft) {
        if (draft.lines().stream().noneMatch(l -> ReceiptLine.ITEM.equals(l.kind()) && l.ingredientId() == null)) {
            return draft;
        }
        List<KnownIngredient> others = pricedAnywhere();
        List<DraftLine> lines = draft.lines().stream()
                .map(line -> {
                    if (!ReceiptLine.ITEM.equals(line.kind()) || line.ingredientId() != null) {
                        return line;
                    }
                    return ReceiptReader.guessIngredient(line.text(), others)
                            .map(guess -> new DraftLine(line.text(), line.kind(), line.quantity(), line.unit(),
                                    line.unitPrice(), line.price(), line.onSale(), guess.id(), guess.name(), line.brand()))
                            .orElse(line);
                })
                .toList();
        return new ReceiptDraft(draft.storeName(), draft.storeId(), draft.purchasedOn(), draft.subtotal(), draft.tax(),
                draft.total(), draft.sumMatches(), draft.duplicateOf(), lines, draft.unreadLines());
    }

    /** What anybody on the server has priced, the most priced first, for lines the household has nothing for. */
    private List<KnownIngredient> pricedAnywhere() {
        return jdbc.query("""
                SELECT i.id, i.name FROM ingredients i
                JOIN (SELECT ingredient_id, count(*) AS n FROM price_observations GROUP BY ingredient_id
                      ORDER BY n DESC LIMIT 3000) priced ON priced.ingredient_id = i.id
                ORDER BY priced.n DESC
                """, (rs, n) -> new KnownIngredient(rs.getObject("id", UUID.class), rs.getString("name")));
    }

    private List<KnownIngredient> knownIngredients(UUID householdId) {
        return jdbc.query("""
                SELECT i.id, i.name FROM ingredients i
                WHERE i.id IN (SELECT ingredient_id FROM grocery_list_items WHERE household_id = ?)
                   OR i.id IN (SELECT ri.ingredient_id FROM recipe_ingredients ri
                               JOIN recipes r ON r.id = ri.recipe_id WHERE r.household_id = ?)
                   OR i.id IN (SELECT ingredient_id FROM price_observations WHERE household_id = ?)
                """, (rs, n) -> new KnownIngredient(rs.getObject("id", UUID.class), rs.getString("name")),
                householdId, householdId, householdId);
    }

    /**
     * Saves a confirmed receipt. The shop is found or made by name. Each ITEM line that counts as
     * an ingredient — by id, or by a name typed on the review screen, found or made as one typed
     * on the list is — teaches the app its price, dated the day on the receipt (today when there
     * is none). NOT_FOOD lines are kept as they were paid for, but price nothing.
     */
    @Transactional
    public ReceiptResponse save(UUID householdId, UUID requesterId, SaveReceiptRequest request) {
        householdService.assertMember(householdId, requesterId);
        Household household = householdRepository.lockById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));

        String barcode = blankToNull(request.barcode());
        if (barcode != null) {
            receiptRepository.findFirstByHouseholdIdAndBarcode(householdId, barcode).ifPresent(saved -> {
                throw new DuplicateReceiptException(saved.getId());
            });
        }

        User by = userRepository.findById(requesterId).orElse(null);
        StorePlace place = request.place() != null ? request.place().toPlace() : null;
        // A receipt linked to a branch but with no shop's name of its own takes the branch's.
        String storeName = Stores.tidy(request.storeName()) != null ? request.storeName()
                : place != null ? place.getName() : null;
        Store store = stores.findOrCreate(household, storeName);
        if (store != null && place != null && place.located()) {
            store.setPlace(copy(place));
        }
        Receipt receipt = Receipt.builder()
                .household(household)
                .store(store)
                .purchasedOn(request.purchasedOn())
                .subtotal(request.subtotal())
                .tax(request.tax())
                .total(request.total())
                .barcode(barcode)
                .rawText(request.rawText())
                .photoIds(photos(householdId, request.photoIds()))
                .place(place)
                .createdBy(by)
                .build();

        for (int i = 0; i < request.lines().size(); i++) {
            SaveLine line = request.lines().get(i);
            if (line == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "One of the lines is empty.");
            }
            String kind = kind(line.kind());
            receipt.getLines().add(ReceiptLine.builder()
                    .receipt(receipt)
                    .position(i)
                    .text(line.text() == null ? "" : line.text().trim())
                    .kind(kind)
                    .quantity(line.quantity())
                    .unit(blankToNull(line.unit()))
                    .brand(Stores.tidy(line.brand()))
                    .unitPrice(line.unitPrice())
                    .price(line.price())
                    .onSale(line.onSale())
                    .ingredient(ReceiptLine.ITEM.equals(kind) ? ingredient(line) : null)
                    .build());
        }
        receipt = receiptRepository.save(receipt);

        LocalDate observedOn = request.purchasedOn() != null ? request.purchasedOn() : LocalDate.now(ZoneId.systemDefault());
        Set<UUID> priced = new LinkedHashSet<>();
        for (ReceiptLine line : receipt.getLines()) {
            if (line.getIngredient() == null) {
                continue;
            }
            priceObservationRepository.save(PriceObservation.builder()
                    .household(household)
                    .store(store)
                    .ingredient(line.getIngredient())
                    .price(line.getPrice())
                    .quantity(line.getQuantity())
                    .unit(line.getUnit())
                    .brand(line.getBrand())
                    .onSale(line.isOnSale())
                    .observedOn(observedOn)
                    .source(PriceObservation.RECEIPT)
                    .receiptLine(line)
                    .createdBy(by)
                    .build());
            priced.add(line.getIngredient().getId());
        }
        // The list's prices are read with SQL, so what was just saved has to be where SQL sees it.
        priceObservationRepository.flush();
        groceryListService.pricesChanged(householdId, priced);
        return toResponse(receipt);
    }

    /** The pages, each one of this household's own images; anybody else's is refused. */
    private List<UUID> photos(UUID householdId, List<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return new ArrayList<>();
        }
        List<UUID> wanted = ids.stream().filter(Objects::nonNull).distinct().toList();
        long ours = imageRepository.findAllById(wanted).stream()
                .filter(image -> image.getHousehold().getId().equals(householdId)).count();
        if (ours != wanted.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "One of the receipt's pictures isn't there. Scan it again.");
        }
        return new ArrayList<>(wanted);
    }

    /** ITEM unless the line says NOT_FOOD; anything else is a mistake worth saying so. */
    private static String kind(String kind) {
        if (kind == null || kind.isBlank() || ReceiptLine.ITEM.equalsIgnoreCase(kind.trim())) {
            return ReceiptLine.ITEM;
        }
        if (ReceiptLine.NOT_FOOD.equalsIgnoreCase(kind.trim())) {
            return ReceiptLine.NOT_FOOD;
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A line is either ITEM or NOT_FOOD.");
    }

    /** The ingredient a line counts as, by id or else by the name typed for it. Null for neither. */
    private Ingredient ingredient(SaveLine line) {
        if (line.ingredientId() != null) {
            Ingredient known = ingredientRepository.findById(line.ingredientId()).orElse(null);
            if (known != null) {
                return known;
            }
            if (blankToNull(line.ingredientName()) == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "One of the lines counts as an ingredient that isn't there any more. Pick it again.");
            }
        }
        String name = blankToNull(line.ingredientName());
        return name == null ? null : ingredientService.findOrCreate(name, blankToNull(line.unit()));
    }

    /**
     * Links a saved receipt to the branch it was bought at (or, with no place, unlinks it). With a
     * `storeName` it is re-filed under that shop — found or made — and the prices it taught move
     * with it, so they are that shop's on the list and the store map. The shop remembers the branch.
     */
    @Transactional
    public ReceiptResponse linkPlace(UUID householdId, UUID receiptId, UUID requesterId, LinkPlaceRequest request) {
        householdService.assertMember(householdId, requesterId);
        Household household = householdRepository.lockById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
        Receipt receipt = find(householdId, receiptId);
        StorePlace place = request.place() != null ? request.place().toPlace() : null;
        receipt.setPlace(place);

        String wanted = Stores.tidy(request.storeName());
        if (wanted != null && (receipt.getStore() == null || !receipt.getStore().getName().equalsIgnoreCase(wanted))) {
            Store moved = stores.findOrCreate(household, wanted);
            receipt.setStore(moved);
            List<PriceObservation> taught = priceObservationRepository.findByReceipt(receiptId);
            taught.forEach(o -> o.setStore(moved));
            priceObservationRepository.saveAll(taught);
            priceObservationRepository.flush();
            Set<UUID> ingredients = new LinkedHashSet<>();
            taught.forEach(o -> ingredients.add(o.getIngredient().getId()));
            groceryListService.pricesChanged(householdId, ingredients);
        }
        if (receipt.getStore() != null && place != null && place.located()) {
            receipt.getStore().setPlace(copy(place));
        }
        return toResponse(receiptRepository.save(receipt));
    }

    /** Its own copy: an embedded value is not to be shared between two rows. */
    private static StorePlace copy(StorePlace place) {
        return new StorePlace(place.getName(), place.getAddress(), place.getLatitude(), place.getLongitude());
    }

    /** Newest shopping first: by the day on the receipt, or the day it was saved when it has none. */
    @Transactional(readOnly = true)
    public List<ReceiptSummary> list(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        Map<UUID, int[]> counts = new HashMap<>();
        receiptRepository.lineCounts(householdId).forEach(row ->
                counts.put((UUID) row[0], new int[]{((Number) row[1]).intValue(), ((Number) row[2]).intValue()}));
        return receiptRepository.findWithStores(householdId).stream()
                .sorted(Comparator.comparing(ReceiptService::shoppedOn).reversed()
                        .thenComparing(Receipt::getCreatedAt, Comparator.reverseOrder()))
                .map(r -> {
                    int[] c = counts.getOrDefault(r.getId(), new int[]{0, 0});
                    return new ReceiptSummary(r.getId(), storeName(r), r.getPurchasedOn(), r.getTotal(), c[0], c[1],
                            r.getCreatedAt());
                })
                .toList();
    }

    private static LocalDate shoppedOn(Receipt receipt) {
        return receipt.getPurchasedOn() != null ? receipt.getPurchasedOn()
                : LocalDate.ofInstant(receipt.getCreatedAt(), ZoneId.systemDefault());
    }

    @Transactional(readOnly = true)
    public ReceiptResponse get(UUID householdId, UUID receiptId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return toResponse(find(householdId, receiptId));
    }

    /** Gone, with its lines and every price it taught; the rows for those things show the price before it. */
    @Transactional
    public void delete(UUID householdId, UUID receiptId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        householdRepository.lockById(householdId);
        Receipt receipt = find(householdId, receiptId);
        List<PriceObservation> taught = priceObservationRepository.findByReceipt(receiptId);
        Set<UUID> ingredients = new LinkedHashSet<>();
        taught.forEach(o -> ingredients.add(o.getIngredient().getId()));
        priceObservationRepository.deleteAll(taught);
        List<UUID> photos = List.copyOf(receipt.getPhotoIds());
        receiptRepository.delete(receipt);
        receiptRepository.flush();
        // The pictures were only ever the receipt's; they go with it.
        if (!photos.isEmpty()) {
            jdbc.update("DELETE FROM stored_images WHERE household_id = ? AND id = ANY (?)", householdId,
                    photos.toArray(UUID[]::new));
        }
        groceryListService.pricesChanged(householdId, ingredients);
    }

    /** What one thing last cost at each shop this household has bought it from, newest first. */
    @Transactional(readOnly = true)
    public List<LastPrice> pricesByStore(UUID householdId, UUID ingredientId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return prices.byStore(householdId, ingredientId);
    }

    /** The household's shops, A to Z, for the review screen to suggest. */
    @Transactional(readOnly = true)
    public List<StoreResponse> stores(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return storeRepository.findByHouseholdIdOrderByNameAsc(householdId).stream()
                .map(s -> new StoreResponse(s.getId(), s.getName(), PlaceDto.of(s.getPlace())))
                .toList();
    }

    /**
     * The map of grocery stores, for the whole server: every chain somebody has priced something at,
     * with the newest price anybody paid there for each thing, and what the asker's list as it
     * stands would come to there. Shops are folded into chains by name ({@link StoreChains}), so
     * one household's "KINGS FOOD MARKETS" and another's "Kings" are one Kings.
     *
     * Nothing says whose a price was beyond whether it was the asker's own: other households are
     * only counted. The chain priced most lately comes first.
     *
     * A row's price at a chain is its newest price for the thing, as it was paid — not scaled to
     * the row's amount, the same as the list's own "≈ $86".
     */
    @Transactional(readOnly = true)
    public List<StorePrices> storePrices(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);

        // Every household's shops, and the chain each one is.
        Map<UUID, String> chainOf = new HashMap<>();
        Map<String, String> ownName = new HashMap<>();
        Map<String, Map<String, Integer>> namesUsed = new HashMap<>();
        jdbc.query("SELECT id, household_id, name FROM stores", rs -> {
            String name = rs.getString("name");
            String chain = StoreChains.key(name);
            if (chain.isEmpty()) {
                return;
            }
            chainOf.put(rs.getObject("id", UUID.class), chain);
            if (householdId.equals(rs.getObject("household_id", UUID.class))) {
                ownName.merge(chain, name, (a, b) -> a.compareToIgnoreCase(b) <= 0 ? a : b);
            }
            namesUsed.computeIfAbsent(chain, c -> new HashMap<>()).merge(name, 1, Integer::sum);
        });

        // The newest price for each thing at each chain: the shops' newest come newest first, so
        // the first met for a thing at a chain is the one to keep.
        Map<String, Map<UUID, StoreItemPrice>> newest = new HashMap<>();
        Map<String, Set<UUID>> households = new HashMap<>();
        for (Prices.ShopPrice paid : prices.newestAtEveryShop()) {
            String chain = chainOf.get(paid.storeId());
            if (chain == null) {
                continue;
            }
            newest.computeIfAbsent(chain, c -> new HashMap<>())
                    .putIfAbsent(paid.ingredientId(), paid.forAsker(householdId));
            households.computeIfAbsent(chain, c -> new HashSet<>()).add(paid.householdId());
        }

        // The branches receipts were linked to, by chain: one each, to about ten metres.
        Map<String, Map<String, PlaceDto>> branches = new HashMap<>();
        jdbc.query("""
                SELECT s.name AS store_name, r.place_name, r.place_address, r.place_latitude, r.place_longitude
                FROM receipts r JOIN stores s ON s.id = r.store_id
                WHERE r.place_latitude IS NOT NULL AND r.place_longitude IS NOT NULL
                ORDER BY r.created_at DESC
                """, rs -> {
            String chain = StoreChains.key(rs.getString("store_name"));
            if (chain.isEmpty()) {
                return;
            }
            double lat = rs.getDouble("place_latitude"), lon = rs.getDouble("place_longitude");
            String spot = Math.round(lat * 10_000) + "," + Math.round(lon * 10_000);
            branches.computeIfAbsent(chain, c -> new LinkedHashMap<>()).putIfAbsent(spot,
                    new PlaceDto(rs.getString("place_name"), rs.getString("place_address"), lat, lon));
        });

        // Still to buy, by what each row is (null for a row typed with no name): a thing on the
        // list twice counts twice, as it does in the list's own total.
        List<UUID> toBuy = jdbc.queryForList(
                "SELECT ingredient_id FROM grocery_list_items WHERE household_id = ? AND NOT checked",
                UUID.class, householdId);

        return newest.entrySet().stream()
                .map(entry -> {
                    String chain = entry.getKey();
                    List<StoreItemPrice> here = entry.getValue().values().stream()
                            .sorted(Comparator.comparing(StoreItemPrice::ingredientName, String.CASE_INSENSITIVE_ORDER))
                            .toList();
                    BigDecimal total = BigDecimal.ZERO;
                    int priced = 0;
                    for (UUID ingredient : toBuy) {
                        StoreItemPrice paid = ingredient != null ? entry.getValue().get(ingredient) : null;
                        if (paid != null) {
                            total = total.add(paid.price());
                            priced++;
                        }
                    }
                    LocalDate last = here.stream().map(StoreItemPrice::observedOn)
                            .filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(null);
                    Set<UUID> pricedBy = households.getOrDefault(chain, Set.of());
                    return new StorePrices(chainId(chain), chainName(chain, ownName, namesUsed), last, here, total,
                            priced, toBuy.size(), pricedBy.size(),
                            ownName.containsKey(chain) || pricedBy.contains(householdId),
                            List.copyOf(branches.getOrDefault(chain, Map.of()).values()));
                })
                .sorted(Comparator.comparing(StorePrices::lastPricedOn, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(StorePrices::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    /** The same chain is the same id on every request, so the phone can tell one from another. */
    private static UUID chainId(String chain) {
        return UUID.nameUUIDFromBytes(("store-chain:" + chain).getBytes(StandardCharsets.UTF_8));
    }

    /** The asker's own name for the chain, else the name most of its shops go by (the shorter on a tie). */
    private static String chainName(String chain, Map<String, String> ownName, Map<String, Map<String, Integer>> namesUsed) {
        String own = ownName.get(chain);
        if (own != null) {
            return own;
        }
        return namesUsed.getOrDefault(chain, Map.of()).entrySet().stream()
                .max(Comparator.<Map.Entry<String, Integer>>comparingInt(Map.Entry::getValue)
                        .thenComparing(e -> -e.getKey().length())
                        .thenComparing(Map.Entry::getKey, Comparator.reverseOrder()))
                .map(Map.Entry::getKey)
                .orElse(chain);
    }

    private Receipt find(UUID householdId, UUID receiptId) {
        return receiptRepository.findById(receiptId)
                .filter(r -> r.getHousehold().getId().equals(householdId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not found"));
    }

    private static ReceiptResponse toResponse(Receipt receipt) {
        List<ReceiptLineResponse> lines = receipt.getLines().stream()
                .map(l -> new ReceiptLineResponse(l.getText(), l.getKind(), l.getQuantity(), l.getUnit(),
                        l.getUnitPrice(), l.getPrice(), l.isOnSale(),
                        l.getIngredient() != null ? l.getIngredient().getId() : null,
                        l.getIngredient() != null ? l.getIngredient().getName() : null,
                        l.getId(), l.getBrand()))
                .toList();
        int items = (int) lines.stream().filter(l -> ReceiptLine.ITEM.equals(l.kind())).count();
        int priced = (int) lines.stream().filter(l -> ReceiptLine.ITEM.equals(l.kind()) && l.ingredientId() != null).count();
        return new ReceiptResponse(receipt.getId(), storeName(receipt), receipt.getPurchasedOn(), receipt.getTotal(),
                items, priced, lines, receipt.getCreatedAt(),
                receipt.getStore() != null ? receipt.getStore().getId() : null, receipt.getSubtotal(), receipt.getTax(),
                List.copyOf(receipt.getPhotoIds()), PlaceDto.of(receipt.getPlace()));
    }

    private static String storeName(Receipt receipt) {
        return receipt.getStore() != null ? receipt.getStore().getName() : null;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
