package com.gehan.mealplanner.domain;

/**
 * Where a saved link goes, worked out from its address. Only the two apps people actually share
 * recipes from get a name of their own; everything else is a website, shown by its address.
 */
public enum SavedLinkSource {
    TIKTOK,
    INSTAGRAM,
    WEB
}
