import type { SourceLink } from '../api/types';

/**
 * The server only ever stores http(s) links, but this is the last stop before the url becomes an
 * href, so it checks again rather than trusting what it was handed.
 */
export function isSafeLink(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const scheme = new URL(url).protocol;
    return scheme === 'http:' || scheme === 'https:';
  } catch {
    return false;
  }
}

/**
 * Hosts whose links are a video of the cooking rather than a page about it. The server keeps
 * the same list (SourceLinks.java), so the link shown as "Watch on …" here is the one an older
 * phone reads as the recipe's videoUrl.
 */
const VIDEO_HOSTS = ['tiktok.com', 'youtube.com', 'youtu.be', 'instagram.com', 'vimeo.com'];

/**
 * Sites people know by name rather than by address: the video sites, and the recipe publishers
 * people save from most — "BBC Good Food", not "bbcgoodfood.com". iOS keeps the same list
 * (RecipeLinks.swift). Anything else is called by its address.
 */
const SITE_NAMES: [string, string][] = [
  ['tiktok.com', 'TikTok'],
  ['youtube.com', 'YouTube'],
  ['youtu.be', 'YouTube'],
  ['instagram.com', 'Instagram'],
  ['vimeo.com', 'Vimeo'],
  ['bbcgoodfood.com', 'BBC Good Food'],
  ['cooking.nytimes.com', 'NYT Cooking'],
  ['allrecipes.com', 'Allrecipes'],
  ['seriouseats.com', 'Serious Eats'],
  ['bonappetit.com', 'Bon Appétit'],
  ['epicurious.com', 'Epicurious'],
  ['foodnetwork.com', 'Food Network'],
  ['food52.com', 'Food52'],
  ['thekitchn.com', 'The Kitchn'],
  ['simplyrecipes.com', 'Simply Recipes'],
  ['delish.com', 'Delish'],
  ['tasty.co', 'Tasty'],
  ['budgetbytes.com', 'Budget Bytes'],
  ['recipetineats.com', 'RecipeTin Eats'],
  ['smittenkitchen.com', 'Smitten Kitchen'],
  ['jamieoliver.com', 'Jamie Oliver'],
  ['minimalistbaker.com', 'Minimalist Baker'],
  ['halfbakedharvest.com', 'Half Baked Harvest'],
  ['kingarthurbaking.com', 'King Arthur Baking'],
  ['cookieandkate.com', 'Cookie and Kate'],
  ['loveandlemons.com', 'Love and Lemons'],
  ['pinchofyum.com', 'Pinch of Yum'],
  ['tasteofhome.com', 'Taste of Home'],
  ['eatingwell.com', 'EatingWell'],
  ['olivemagazine.com', 'olive'],
  ['nigella.com', 'Nigella'],
  ['pinterest.com', 'Pinterest'],
];

/**
 * The host of a link, including one typed the way people type them — "tiktok.com/@cook/…",
 * with no https:// — which the server accepts and fills in.
 */
function hostOf(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;
    const host = new URL(withScheme).hostname.toLowerCase();
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

const onHost = (host: string, site: string) => host === site || host.endsWith(`.${site}`);

export function isVideoLink(url: string): boolean {
  const host = hostOf(url);
  return host !== null && VIDEO_HOSTS.some((site) => onHost(host, site));
}

/** Whether a link is to YouTube, which the server files as a website. */
export function isYouTubeLink(url: string): boolean {
  const host = hostOf(url);
  return host !== null && (onHost(host, 'youtube.com') || onHost(host, 'youtu.be'));
}

/** "TikTok", "BBC Good Food", or the address without its www — what a link is called by default. */
export function linkSiteName(url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  const known = SITE_NAMES.find(([site]) => onHost(host, site));
  return known ? known[1] : host.replace(/^www\./, '');
}

/** "Watch on TikTok" beats "Watch video" when we can tell where it goes. */
export function videoHostLabel(url: string): string {
  return linkSiteName(url) ?? 'video';
}

/** What to call a link on screen: its own name when it has one, otherwise the site's. */
export function linkName(link: SourceLink): string {
  return link.label?.trim() || linkSiteName(link.url) || link.url;
}
