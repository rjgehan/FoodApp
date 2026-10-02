package com.gehan.mealplanner.nutrition;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.zip.GZIPInputStream;

/**
 * Puts the bundled USDA table into the database, once per version of it.
 *
 * The file is built by backend/scripts/build_nutrition_table.py from USDA FoodData Central
 * (public domain): "U.S. Department of Agriculture, Agricultural Research Service. FoodData
 * Central, 2026. fdc.nal.usda.gov." Its version is a hash of the file, so shipping a rebuilt
 * table is all it takes to reload it, and restarting with the same one costs one small query.
 *
 * The two tables are the loader's alone: replacing them wholesale is safe because nothing else
 * writes them, and the ingredient matches that point into them use USDA's own stable ids.
 * A transaction-scoped advisory lock keeps two servers starting together from loading it twice.
 */
@Component
public class UsdaTableLoader implements ApplicationRunner {

    static final String RESOURCE = "nutrition/usda-foods.csv.gz";
    static final String NAME = "usda";
    private static final long LOCK = 0x6e757472L;  // "nutr"
    private static final Logger log = LoggerFactory.getLogger(UsdaTableLoader.class);

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final FoodTable table;

    public UsdaTableLoader(JdbcTemplate jdbc, TransactionTemplate tx, FoodTable table) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.table = table;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            load();
        } catch (Exception e) {
            // Nutrition is a side dish: a server that cannot load it still plans meals and shops.
            log.warn("Could not load the USDA nutrition table: {}", e.getMessage());
        }
    }

    /** True when it loaded rows; false when the database already had this version. */
    boolean load() throws IOException {
        byte[] file;
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            file = in.readAllBytes();
        }
        String version = "sha256:" + sha256(file).substring(0, 16);
        if (version.equals(currentVersion())) return false;

        List<String[]> rows = parse(file);
        Boolean loaded = tx.execute(status -> {
            jdbc.queryForObject("SELECT pg_advisory_xact_lock(?)", Object.class, LOCK);
            // Whoever held the lock may have just loaded this very version.
            if (version.equals(currentVersion())) return false;
            jdbc.update("DELETE FROM nutrition_food_portions");
            jdbc.update("DELETE FROM nutrition_foods");
            insert(rows);
            jdbc.update("""
                    INSERT INTO nutrition_data_versions (name, version, row_count, loaded_at) VALUES (?, ?, ?, now())
                    ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version, row_count = EXCLUDED.row_count,
                        loaded_at = EXCLUDED.loaded_at
                    """, NAME, version, rows.size());
            return true;
        });
        table.forget();
        if (Boolean.TRUE.equals(loaded)) log.info("Loaded {} USDA foods ({})", rows.size(), version);
        return Boolean.TRUE.equals(loaded);
    }

    String currentVersion() {
        List<String> found = jdbc.queryForList("SELECT version FROM nutrition_data_versions WHERE name = ?",
                String.class, NAME);
        return found.isEmpty() ? null : found.get(0);
    }

    private void insert(List<String[]> rows) {
        List<Object[]> foods = new ArrayList<>(rows.size());
        List<Object[]> portions = new ArrayList<>(rows.size() * 3);
        for (String[] r : rows) {
            int id = Integer.parseInt(r[0]);
            Object[] food = new Object[16];
            food[0] = id;
            food[1] = r[1];
            food[2] = r[2].isEmpty() ? null : r[2];
            food[3] = r[3];
            for (int i = 4; i < 16; i++) food[i] = r[i].isEmpty() ? null : Double.parseDouble(r[i]);
            foods.add(food);

            if (r.length > 16 && !r[16].isEmpty()) {
                int position = 0;
                for (String portion : r[16].split("\\|")) {
                    Object[] parsed = portion(portion);
                    if (parsed == null) continue;
                    portions.add(new Object[]{id, position++, parsed[0], parsed[1], parsed[2]});
                }
            }
        }
        jdbc.batchUpdate("""
                INSERT INTO nutrition_foods (fdc_id, source, category, name, kcal, protein, carbs, fat, fibre, sugars,
                    sodium_mg, sat_fat, iron_mg, calcium_mg, vitamin_c_mg, potassium_mg)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, foods);
        jdbc.batchUpdate("INSERT INTO nutrition_food_portions (fdc_id, position, amount, label, grams) VALUES (?, ?, ?, ?, ?)",
                portions);
    }

    /** A row of the file as the app holds it in memory — the same shape FoodTable reads back. */
    static Food food(String[] r) {
        Double[] v = new Double[12];
        for (int i = 0; i < 12; i++) v[i] = r[i + 4].isEmpty() ? null : Double.parseDouble(r[i + 4]);
        List<Food.Portion> portions = new ArrayList<>();
        if (r.length > 16 && !r[16].isEmpty()) {
            for (String text : r[16].split("\\|")) {
                Object[] p = portion(text);
                if (p != null) portions.add(new Food.Portion((Double) p[0], (String) p[1], (Double) p[2]));
            }
        }
        return new Food(Integer.parseInt(r[0]), r[1], r[2].isEmpty() ? null : r[2], r[3],
                new Nutrients(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9], v[10], v[11]),
                List.copyOf(portions));
    }

    /** Every food in the bundled file, without a database — for tests. */
    static List<Food> bundled() throws IOException {
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            return parse(in.readAllBytes()).stream().map(UsdaTableLoader::food).toList();
        }
    }

    /** "1 cup, chopped=160" → [1.0, "cup, chopped", 160.0]; null when it is not that shape. */
    static Object[] portion(String text) {
        int equals = text.lastIndexOf('=');
        int space = text.indexOf(' ');
        if (equals < 0 || space < 0 || space > equals) return null;
        try {
            double amount = Double.parseDouble(text.substring(0, space));
            double grams = Double.parseDouble(text.substring(equals + 1));
            String label = text.substring(space + 1, equals).trim();
            if (amount <= 0 || grams <= 0 || label.isEmpty()) return null;
            return new Object[]{amount, label.length() > 200 ? label.substring(0, 200) : label, grams};
        } catch (NumberFormatException e) {
            return null;
        }
    }

    static List<String[]> parse(byte[] gzipped) throws IOException {
        List<String[]> rows = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new GZIPInputStream(new ByteArrayInputStream(gzipped)), StandardCharsets.UTF_8))) {
            String header = reader.readLine();
            if (header == null || !header.startsWith("fdc_id,")) throw new IOException("Not the nutrition table");
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.isBlank()) rows.add(csv(line));
            }
        }
        return rows;
    }

    /** One CSV line as Python's csv module writes it: quotes only where needed, "" inside them. */
    static String[] csv(String line) {
        List<String> cells = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (quoted) {
                if (c == '"' && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    cell.append('"');
                    i++;
                } else if (c == '"') {
                    quoted = false;
                } else {
                    cell.append(c);
                }
            } else if (c == '"') {
                quoted = true;
            } else if (c == ',') {
                cells.add(cell.toString());
                cell.setLength(0);
            } else {
                cell.append(c);
            }
        }
        cells.add(cell.toString());
        return cells.toArray(String[]::new);
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
