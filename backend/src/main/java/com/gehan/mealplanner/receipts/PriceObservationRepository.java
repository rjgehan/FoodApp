package com.gehan.mealplanner.receipts;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface PriceObservationRepository extends JpaRepository<PriceObservation, UUID> {

    List<PriceObservation> findByHouseholdIdAndIngredientIdOrderByObservedOnDescCreatedAtDesc(
            UUID householdId, UUID ingredientId);

    /** The prices a receipt taught the app, for taking back when it is deleted. */
    @Query("select o from PriceObservation o where o.receiptLine.receipt.id = :receiptId")
    List<PriceObservation> findByReceipt(@Param("receiptId") UUID receiptId);
}
