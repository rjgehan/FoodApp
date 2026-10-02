import { api } from '../api/client';
import type { RecipeSection, SavedLink, SavedLinkSource } from '../api/types';
import { isVideoLink, isYouTubeLink, linkSiteName } from './videoLink';

/** Where the list lives. A page of Recipes, since that is where you go looking for what to cook. */
export const SAVED_LINKS_PATH = '/recipes/saved-links';

/**
 * What kind of link it is, for the filter chips: the server's TikTok, Instagram and Web, with
 * YouTube told apart from the rest of the web by its address.
 */
export type LinkKind = 'TIKTOK' | 'YOUTUBE' | 'INSTAGRAM' | 'WEB';

export function linkKind(link: { source?: SavedLinkSource | null; url?: string | null }): LinkKind {
  if (link.source === 'TIKTOK' || link.source === 'INSTAGRAM') return link.source;
  return link.url && isYouTubeLink(link.url) ? 'YOUTUBE' : 'WEB';
}

/** A video rather than a page — drawn with a play mark rather than a globe. */
export function isVideo(link: { source?: SavedLinkSource | null; url?: string | null }): boolean {
  return link.source === 'TIKTOK' || link.source === 'INSTAGRAM' || (!!link.url && isVideoLink(link.url));
}

/** "today", "3 days ago", "last week" — when something was saved or shared. */
export function timeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** "TikTok", "Instagram", "BBC Good Food" or the website's address — what the badge on a saved link says. */
export function sourceLabel(link: { source?: SavedLinkSource | null; url?: string | null }): string {
  if (link.source === 'TIKTOK') return 'TikTok';
  if (link.source === 'INSTAGRAM') return 'Instagram';
  return (link.url && linkSiteName(link.url)) || 'Website';
}

/**
 * Keeps a link. The server reads the page for a name and a picture and never refuses over
 * them, so the only failure worth expecting is a link that is not one.
 */
export function saveLink(
  householdId: string,
  body: { url: string; name?: string | null; section?: RecipeSection | null; personal?: boolean; coverImageId?: string | null },
): Promise<SavedLink> {
  return api<SavedLink>('POST', `/api/households/${householdId}/saved-links`, body);
}
