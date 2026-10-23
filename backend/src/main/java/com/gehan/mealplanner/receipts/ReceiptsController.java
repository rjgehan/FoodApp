package com.gehan.mealplanner.receipts;

import com.gehan.mealplanner.dto.GroceryListDtos.LastPrice;
import com.gehan.mealplanner.receipts.ReceiptDtos.HiddenPlaceResponse;
import com.gehan.mealplanner.receipts.ReceiptDtos.HidePlaceRequest;
import com.gehan.mealplanner.receipts.ReceiptDtos.LinkPlaceRequest;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReadReceiptRequest;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptDraft;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptResponse;
import com.gehan.mealplanner.receipts.ReceiptDtos.ReceiptSummary;
import com.gehan.mealplanner.receipts.ReceiptDtos.SaveReceiptRequest;
import com.gehan.mealplanner.receipts.ReceiptDtos.StorePrices;
import com.gehan.mealplanner.receipts.ReceiptDtos.StoreResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Scanned receipts and the shops they came from. Any member of the household; nobody else. */
@RestController
@RequestMapping("/api/households/{householdId}")
public class ReceiptsController {

    private final ReceiptService receiptService;
    private final HiddenPlaceService hiddenPlaceService;

    public ReceiptsController(ReceiptService receiptService, HiddenPlaceService hiddenPlaceService) {
        this.receiptService = receiptService;
        this.hiddenPlaceService = hiddenPlaceService;
    }

    /** The text the phone read off a receipt, back as a draft to check. Saves nothing. */
    @PostMapping("/receipts/read")
    public ReceiptDraft read(@AuthenticationPrincipal UUID userId,
                             @PathVariable UUID householdId,
                             @Valid @RequestBody ReadReceiptRequest request) {
        return receiptService.read(householdId, userId, request);
    }

    /** A checked receipt: saved, with a price for each line that counts as an ingredient. 409 if scanned before. */
    @PostMapping("/receipts")
    public ResponseEntity<ReceiptResponse> save(@AuthenticationPrincipal UUID userId,
                                                @PathVariable UUID householdId,
                                                @Valid @RequestBody SaveReceiptRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(receiptService.save(householdId, userId, request));
    }

    @GetMapping("/receipts")
    public List<ReceiptSummary> list(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return receiptService.list(householdId, userId);
    }

    @GetMapping("/receipts/{receiptId}")
    public ReceiptResponse get(@AuthenticationPrincipal UUID userId,
                               @PathVariable UUID householdId,
                               @PathVariable UUID receiptId) {
        return receiptService.get(householdId, receiptId, userId);
    }

    /**
     * A saved receipt put right: the same body as saving one, and its prices taught again from the
     * lines as they are now. The barcode, the raw text and the branch stay as they were.
     */
    @PutMapping("/receipts/{receiptId}")
    public ReceiptResponse edit(@AuthenticationPrincipal UUID userId,
                                @PathVariable UUID householdId,
                                @PathVariable UUID receiptId,
                                @Valid @RequestBody SaveReceiptRequest request) {
        return receiptService.edit(householdId, receiptId, userId, request);
    }

    /** Links a saved receipt to the branch it was bought at, or unlinks it. */
    @PutMapping("/receipts/{receiptId}/place")
    public ReceiptResponse linkPlace(@AuthenticationPrincipal UUID userId,
                                     @PathVariable UUID householdId,
                                     @PathVariable UUID receiptId,
                                     @Valid @RequestBody LinkPlaceRequest request) {
        return receiptService.linkPlace(householdId, receiptId, userId, request);
    }

    /** Takes the receipt back, and every price it taught. */
    @DeleteMapping("/receipts/{receiptId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UUID userId,
                                       @PathVariable UUID householdId,
                                       @PathVariable UUID receiptId) {
        receiptService.delete(householdId, receiptId, userId);
        return ResponseEntity.noContent().build();
    }

    /** The item sheet's "last paid at each shop". */
    @GetMapping("/ingredients/{ingredientId}/prices")
    public List<LastPrice> pricesByStore(@AuthenticationPrincipal UUID userId,
                                         @PathVariable UUID householdId,
                                         @PathVariable UUID ingredientId) {
        return receiptService.pricesByStore(householdId, ingredientId, userId);
    }

    @GetMapping("/stores")
    public List<StoreResponse> stores(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return receiptService.stores(householdId, userId);
    }

    /** The map of grocery stores: each shop, what was last paid there, and the list priced there. */
    @GetMapping("/stores/prices")
    public List<StorePrices> storePrices(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return receiptService.storePrices(householdId, userId);
    }

    /** The places the household has taken off its store map. */
    @GetMapping("/stores/hidden")
    public List<HiddenPlaceResponse> hiddenPlaces(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return hiddenPlaceService.list(householdId, userId);
    }

    /** "Not a grocery store": off the household's map. The one already hidden comes back for a repeat. */
    @PostMapping("/stores/hidden")
    public ResponseEntity<HiddenPlaceResponse> hidePlace(@AuthenticationPrincipal UUID userId,
                                                         @PathVariable UUID householdId,
                                                         @Valid @RequestBody HidePlaceRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(hiddenPlaceService.hide(householdId, userId, request));
    }

    /** Back on the map. */
    @DeleteMapping("/stores/hidden/{hiddenId}")
    public ResponseEntity<Void> showPlace(@AuthenticationPrincipal UUID userId,
                                          @PathVariable UUID householdId,
                                          @PathVariable UUID hiddenId) {
        hiddenPlaceService.show(householdId, hiddenId, userId);
        return ResponseEntity.noContent().build();
    }
}
