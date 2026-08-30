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

/** "Watch on TikTok" beats "Watch video" when we can tell where it goes. */
export function videoHostLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.endsWith('tiktok.com')) return 'TikTok';
    if (host.endsWith('youtube.com') || host === 'youtu.be') return 'YouTube';
    if (host.endsWith('instagram.com')) return 'Instagram';
    return host;
  } catch {
    return 'video';
  }
}
