package com.gehan.mealplanner.domain;

/**
 * Whether you have something, not how much. Nobody keeps "1.5 cups of flour left" up to date,
 * and a count that is wrong within a week is worse than none — so it is three states you can
 * change with one tap. LOW and OUT both put the item on the grocery list.
 */
public enum StockStatus {
    HAVE,
    LOW,
    OUT
}
