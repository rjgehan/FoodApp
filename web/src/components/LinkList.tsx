import type { SourceLink } from '../api/types';
import { ChevronRightIcon, LinkIcon, PlayIcon } from './icons';
import { isSafeLink, isVideoLink, linkName, linkSiteName, videoHostLabel } from '../utils/videoLink';

/**
 * A recipe's links as rows you can tap: its name (or the site's), and where it goes underneath
 * when the name alone would not say. Videos keep the play mark they have everywhere else.
 */
export default function LinkList({ links }: { links: SourceLink[] }) {
  return (
    <ul className="divide-y divide-line">
      {links.filter((l) => isSafeLink(l.url)).map((link, i) => {
        const video = isVideoLink(link.url);
        const site = linkSiteName(link.url);
        const name = link.label?.trim() ? link.label.trim() : video ? `Watch on ${videoHostLabel(link.url)}` : linkName(link);
        return (
          <li key={`${link.url}-${i}`}>
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              className="press flex min-h-touch items-center gap-3 py-2.5"
            >
              {video ? (
                <PlayIcon className="h-5 w-5 shrink-0 text-accent" />
              ) : (
                <LinkIcon className="h-5 w-5 shrink-0 text-accent" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{name}</span>
                {site && !name.includes(site) && <span className="block truncate text-sm text-muted">{site}</span>}
              </span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-subtle" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The words on the big video button: the name somebody gave it, with the site after it quietly,
 * or "Watch on TikTok" when it has none. The name was typed on purpose — iOS shows it too.
 */
export function FeaturedVideoName({ link }: { link: SourceLink }) {
  const label = link.label?.trim();
  if (!label) return <>Watch on {videoHostLabel(link.url)}</>;
  return (
    <span className="min-w-0 truncate">
      {label}
      <span className="font-normal text-muted"> · {videoHostLabel(link.url)}</span>
    </span>
  );
}
