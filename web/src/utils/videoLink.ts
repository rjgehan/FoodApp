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

/** Sites people know by name rather than by address. */
const SITE_NAMES: [string, string][] = [
  ['tiktok.com', 'TikTok'],
  ['youtube.com', 'YouTube'],
  ['youtu.be', 'YouTube'],
  ['instagram.com', 'Instagram'],
  ['vimeo.com', 'Vimeo'],
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

/** "TikTok", "YouTube", or the address without its www — what a link is called by default. */
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
