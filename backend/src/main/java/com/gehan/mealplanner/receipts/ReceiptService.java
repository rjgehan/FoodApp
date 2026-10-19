package com.gehan.mealplanner.receipts;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.GroceryListDtos.LastPrice;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReadReceiptRequest;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptDraft;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptLineResponse;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptResponse;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptSummary;
import com.gehan.mealplanner.receipts.ReceiptDtos.SaveLine;
import com.gehan.mealplanner.receipts.ReceiptDtos.SaveReceiptRequest;
import com.gehan.mealplanner.receipts.ReceiptDtos.StoreResponse;
import com.gehan.mealplanner.receipts.ReceiptReader.KnownIngredient;
import com.gehan.mealplanner.receipts.ReceiptReader.KnownStore;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.IngredientRepository;
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
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
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
                          JdbcTemplate jdbc) {
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
        ReceiptDraft draft = ReceiptReader.read(request.lines(), knownIngredients(householdId), known);
        String barcode = blankToNull(request.barcode());
        if (barcode == null) {
            return draft;
        }
        return receiptRepository.findFirstByHouseholdIdAndBarcode(householdId, barcode)
                .map(saved -> draft.withDuplicateOf(saved.getId()))
                .orElse(draft);
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
        Store store = stores.findOrCreate(household, request.storeName());
        Receipt receipt = Receipt.builder()
                .household(household)
                .store(store)
                .purchasedOn(request.purchasedOn())
                .subtotal(request.subtotal())
                .tax(request.tax())
                .total(request.total())
                .barcode(barcode)
                .rawText(request.rawText())
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
        receiptRepository.delete(receipt);
        receiptRepository.flush();
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
                .map(s -> new StoreResponse(s.getId(), s.getName()))
                .toList();
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
                        l.getId()))
                .toList();
        int items = (int) lines.stream().filter(l -> ReceiptLine.ITEM.equals(l.kind())).count();
        int priced = (int) lines.stream().filter(l -> ReceiptLine.ITEM.equals(l.kind()) && l.ingredientId() != null).count();
        return new ReceiptResponse(receipt.getId(), storeName(receipt), receipt.getPurchasedOn(), receipt.getTotal(),
                items, priced, lines, receipt.getCreatedAt(),
                receipt.getStore() != null ? receipt.getStore().getId() : null, receipt.getSubtotal(), receipt.getTax());
    }

    private static String storeName(Receipt receipt) {
        return receipt.getStore() != null ? receipt.getStore().getName() : null;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
