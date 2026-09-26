/**
 * The two kinds of link the app hands to a person — an invite into a household, and an owner's
 * password reset — picked out of whatever was pasted or scanned. Only the path matters: the link
 * may come from another address for the same server (the LAN one, say), and a token means the
 * same thing wherever it was typed.
 */
export type AppLink = { kind: 'invite' | 'reset'; token: string };

const TOKEN = '[A-Za-z0-9_-]{20,}';
const IN_PATH = new RegExp(`/(invite|reset)/(${TOKEN})(?:[/?#]|$)`);

export function parseAppLink(text: string): AppLink | null {
  const trimmed = text.trim();
  const found = IN_PATH.exec(trimmed);
  if (found) return { kind: found[1] as AppLink['kind'], token: found[2] };
  return null;
}

/** Where an invite link lives on this site. */
export function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}
