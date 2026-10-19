package com.gehan.mealplanner.receipts;

import com.gehan.mealplanner.dto.GroceryListDtos.LastPrice;
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

    public ReceiptsController(ReceiptService receiptService) {
        this.receiptService = receiptService;
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
}
