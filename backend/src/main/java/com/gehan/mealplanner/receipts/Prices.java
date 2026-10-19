package com.gehan.mealplanner.receipts;

import com.gehan.mealplanner.dto.GroceryListDtos.LastPrice;
import com.gehan.mealplanner.receipts.ReceiptDtos.StoreItemPrice;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The newest price a household has for each thing it has ever priced, for the "≈ $3.49" beside a
 * grocery row. One query for the whole list, however long it is — the list is read on every
 * change, and a query per row would be most of the work. Every priced thing rather than only
 * those on the list, so a row added in the same request (not yet written where SQL can see the
 * list) still gets its price; a household prices a few hundred things, not millions.
 *
 * Newest is by the day it was paid, then by when it was written down: a receipt from last week
 * scanned today does not beat the price somebody typed in yesterday. Read with SQL, so whoever
 * has just saved a price through JPA flushes it first.
 */
@Component
public class Prices {

    private final JdbcTemplate jdbc;

    public Prices(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** By ingredient id; things never priced are simply missing. */
    public Map<UUID, LastPrice> latest(UUID householdId) {
        Map<UUID, LastPrice> latest = new HashMap<>();
        jdbc.query("""
                SELECT DISTINCT ON (o.ingredient_id)
                       o.ingredient_id, o.price, o.quantity, o.unit, s.name AS store_name,
                       o.observed_on, o.on_sale, o.source, o.brand
                FROM price_observations o
                LEFT JOIN stores s ON s.id = o.store_id
                WHERE o.household_id = ?
                ORDER BY o.ingredient_id, o.observed_on DESC, o.created_at DESC
                """, rs -> {
            latest.put(rs.getObject("ingredient_id", UUID.class), lastPrice(rs));
        }, householdId);
        return latest;
    }

    /**
     * What one thing last cost at each shop the household has bought it from, newest first — the
     * item sheet's "Kings $3.49 · ShopRite $2.99". Prices typed in without a shop count as one
     * more "shop" of their own, so a price is never hidden for want of one.
     */
    public List<LastPrice> byStore(UUID householdId, UUID ingredientId) {
        List<LastPrice> prices = jdbc.query("""
                SELECT DISTINCT ON (o.store_id)
                       o.price, o.quantity, o.unit, s.name AS store_name,
                       o.observed_on, o.on_sale, o.source, o.brand, o.created_at
                FROM price_observations o
                LEFT JOIN stores s ON s.id = o.store_id
                WHERE o.household_id = ? AND o.ingredient_id = ?
                ORDER BY o.store_id, o.observed_on DESC, o.created_at DESC
                """, (rs, row) -> lastPrice(rs), householdId, ingredientId);
        return prices.stream()
                .sorted(Comparator.comparing(LastPrice::observedOn, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
    }

    /**
     * Every shop's newest price for each thing bought there, across every household on the server
     * — the store map's raw material, in one query. Ingredients are shared by all households, so
     * one household's milk is another's. A price typed in without a shop belongs to none, so it
     * is not here. Newest first within each thing, so whoever folds shops into chains can keep the
     * first it meets.
     */
    public List<ShopPrice> newestAtEveryShop() {
        return jdbc.query("""
                SELECT * FROM (
                    SELECT DISTINCT ON (o.store_id, o.ingredient_id)
                           o.store_id, o.household_id, o.ingredient_id, i.name AS ingredient_name, o.price,
                           o.quantity, o.unit, o.observed_on, o.on_sale, o.source, o.brand, o.created_at
                    FROM price_observations o
                    JOIN ingredients i ON i.id = o.ingredient_id
                    WHERE o.store_id IS NOT NULL
                    ORDER BY o.store_id, o.ingredient_id, o.observed_on DESC, o.created_at DESC
                ) newest
                ORDER BY observed_on DESC, created_at DESC
                """, (rs, row) -> {
            Date observedOn = rs.getDate("observed_on");
            return new ShopPrice(
                    rs.getObject("store_id", UUID.class),
                    rs.getObject("household_id", UUID.class),
                    rs.getObject("ingredient_id", UUID.class),
                    rs.getString("ingredient_name"),
                    rs.getBigDecimal("price"),
                    rs.getBigDecimal("quantity"),
                    rs.getString("unit"),
                    observedOn != null ? observedOn.toLocalDate() : null,
                    rs.getBoolean("on_sale"),
                    rs.getString("source"),
                    rs.getString("brand"));
        });
    }

    /** One shop's newest price for one thing, and which household paid it — never sent as it is. */
    public record ShopPrice(
            UUID storeId,
            UUID householdId,
            UUID ingredientId,
            String ingredientName,
            BigDecimal price,
            BigDecimal quantity,
            String unit,
            LocalDate observedOn,
            boolean onSale,
            String source,
            String brand) {

        StoreItemPrice forAsker(UUID askerHousehold) {
            return new StoreItemPrice(ingredientId, ingredientName, price, quantity, unit, observedOn, onSale, source,
                    brand, householdId.equals(askerHousehold));
        }
    }

    private static LastPrice lastPrice(ResultSet rs) throws SQLException {
        Date observedOn = rs.getDate("observed_on");
        return new LastPrice(
                rs.getBigDecimal("price"),
                rs.getBigDecimal("quantity"),
                rs.getString("unit"),
                rs.getString("store_name"),
                observedOn != null ? observedOn.toLocalDate() : null,
                rs.getBoolean("on_sale"),
                rs.getString("source"),
                rs.getString("brand"));
    }
}
