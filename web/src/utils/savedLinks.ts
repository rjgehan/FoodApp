import { api } from '../api/client';
import type { RecipeSection, SavedLink, SavedLinkSource } from '../api/types';
import { linkSiteName } from './videoLink';

/** Where the list lives. A page of Recipes, since that is where you go looking for what to cook. */
export const SAVED_LINKS_PATH = '/recipes/saved-links';

/** "TikTok", "Instagram", or the website's address — what the badge on a saved link says. */
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
