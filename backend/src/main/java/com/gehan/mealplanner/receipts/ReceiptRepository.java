package com.gehan.mealplanner.receipts;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReceiptRepository extends JpaRepository<Receipt, UUID> {

    /** The household's receipts with their stores, in one query. */
    @Query("select r from Receipt r left join fetch r.store where r.household.id = :householdId")
    List<Receipt> findWithStores(@Param("householdId") UUID householdId);

    Optional<Receipt> findFirstByHouseholdIdAndBarcode(UUID householdId, String barcode);

    /**
     * How many lines each of the household's receipts has, as [receipt id, ITEM lines, ITEM
     * lines that count as an ingredient] — the Receipts list's counts, in one query rather than
     * one per receipt.
     */
    @Query("select l.receipt.id,"
            + " sum(case when l.kind = 'ITEM' then 1 else 0 end),"
            + " sum(case when l.kind = 'ITEM' and l.ingredient is not null then 1 else 0 end)"
            + " from ReceiptLine l where l.receipt.household.id = :householdId group by l.receipt.id")
    List<Object[]> lineCounts(@Param("householdId") UUID householdId);
}
