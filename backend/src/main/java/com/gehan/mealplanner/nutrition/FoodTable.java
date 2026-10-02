package com.gehan.mealplanner.nutrition;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Every USDA food, held in memory.
 *
 * Eight thousand rows is about four megabytes of objects — small enough that matching an
 * ingredient can score every food in a few milliseconds instead of asking Postgres for fuzzy
 * text search it would need an extension for. Read from the database (the loader keeps that up
 * to date) the first time anything needs it, not at startup, so a server that never shows
 * nutrition never pays for it.
 */
@Service
public class FoodTable {

    private final JdbcTemplate jdbc;
    private volatile Map<Integer, Food> foods;
    private volatile int generation;

    @org.springframework.beans.factory.annotation.Autowired
    public FoodTable(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** A table that is already in memory — for tests that read the bundled file directly. */
    FoodTable(Collection<Food> foods) {
        this.jdbc = null;
        Map<Integer, Food> byId = new HashMap<>();
        for (Food food : foods) byId.put(food.fdcId(), food);
        this.foods = Collections.unmodifiableMap(byId);
    }

    public Optional<Food> find(int fdcId) {
        return Optional.ofNullable(foods().get(fdcId));
    }

    public Collection<Food> all() {
        return foods().values();
    }

    public int size() {
        return foods().size();
    }

    /** Goes up each time the foods are read afresh, so anything built from them knows to rebuild. */
    int generation() {
        foods();
        return generation;
    }

    /** Called by the loader after it replaces the rows, so the next read sees the new ones. */
    void forget() {
        foods = null;
    }

    private Map<Integer, Food> foods() {
        Map<Integer, Food> loaded = foods;
        if (loaded == null) {
            synchronized (this) {
                loaded = foods;
                if (loaded == null) {
                    loaded = read();
                    generation++;
                    foods = loaded;
                }
            }
        }
        return loaded;
    }

    private Map<Integer, Food> read() {
        Map<Integer, List<Food.Portion>> portions = new HashMap<>();
        jdbc.query("SELECT fdc_id, amount, label, grams FROM nutrition_food_portions ORDER BY fdc_id, position", rs -> {
            portions.computeIfAbsent(rs.getInt(1), k -> new ArrayList<>())
                    .add(new Food.Portion(rs.getDouble(2), rs.getString(3), rs.getDouble(4)));
        });
        Map<Integer, Food> byId = new HashMap<>();
        jdbc.query("""
                SELECT fdc_id, source, category, name, kcal, protein, carbs, fat, fibre, sugars, sodium_mg,
                       sat_fat, iron_mg, calcium_mg, vitamin_c_mg, potassium_mg
                FROM nutrition_foods
                """, rs -> {
            int id = rs.getInt(1);
            Nutrients per100 = new Nutrients(value(rs, 5), value(rs, 6), value(rs, 7), value(rs, 8), value(rs, 9),
                    value(rs, 10), value(rs, 11), value(rs, 12), value(rs, 13), value(rs, 14), value(rs, 15),
                    value(rs, 16));
            byId.put(id, new Food(id, rs.getString(2), rs.getString(3), rs.getString(4), per100,
                    List.copyOf(portions.getOrDefault(id, List.of()))));
        });
        return Collections.unmodifiableMap(byId);
    }

    private static Double value(java.sql.ResultSet rs, int column) throws java.sql.SQLException {
        double v = rs.getDouble(column);
        return rs.wasNull() ? null : v;
    }
}
