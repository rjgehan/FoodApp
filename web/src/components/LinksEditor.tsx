import { useState } from 'react';
import type { SourceLink } from '../api/types';
import { Button, IconButton, Input } from './ui';
import { PlusIcon, TrashIcon } from './icons';
import { linkSiteName } from '../utils/videoLink';

/** A link while it is being typed: plain text, and a key so React keeps each row's focus. */
export interface DraftLink {
  key: number;
  url: string;
  label: string;
}

let nextKey = 0;

/** SourceLinks.MAX_LINKS on the server. */
const MAX_LINKS = 20;

export function toDraftLinks(links: SourceLink[] | null | undefined): DraftLink[] {
  return (links ?? []).map((l) => ({ key: nextKey++, url: l.url, label: l.label ?? '' }));
}

/** What gets sent: empty rows dropped, and a blank name meaning "call it after the site". */
export function fromDraftLinks(rows: DraftLink[]): SourceLink[] {
  return rows
    .filter((r) => r.url.trim())
    .map((r) => ({ url: r.url.trim(), label: r.label.trim() || null }));
}

/**
 * A recipe's links — the blog it came from, the TikTok of it being made, the one with the
 * better sauce. One row per link, a name underneath once there is an address to name, and
 * "Add link" for another. Used by the recipe form and by the recipe page's own editor, so the
 * two can never disagree about what a link is.
 */
export default function LinksEditor({
  value,
  onChange,
}: {
  value: DraftLink[];
  onChange: (rows: DraftLink[]) => void;
}) {
  // The row just added, so the cursor lands in it rather than back at the top of the page.
  const [focusKey, setFocusKey] = useState<number | null>(null);

  function update(key: number, patch: Partial<DraftLink>) {
    onChange(value.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function add() {
    const key = nextKey++;
    setFocusKey(key);
    onChange([...value, { key, url: '', label: '' }]);
  }

  return (
    <div>
      {value.length > 0 && (
        <ul className="divide-y divide-line">
          {value.map((row, i) => {
            const site = linkSiteName(row.url);
            return (
              <li key={row.key} className="space-y-1.5 py-2">
                <div className="flex items-center gap-1.5">
                  {/* Not type="url": the browser would refuse "tiktok.com/…", which is how people type
                      links and which the server accepts. inputMode still brings up the URL keyboard. */}
                  <Input
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="https://…"
                    className="min-w-0 flex-1"
                    value={row.url}
                    autoFocus={focusKey === row.key}
                    onChange={(e) => update(row.key, { url: e.target.value })}
                    aria-label={`Link ${i + 1}`}
                  />
                  <IconButton
                    label={`Remove link ${i + 1}`}
                    className="text-subtle"
                    onClick={() => onChange(value.filter((r) => r.key !== row.key))}
                  >
                    <TrashIcon className="h-5 w-5" />
                  </IconButton>
                </div>
                {/* Named after the site unless somebody says otherwise, and the placeholder says which. */}
                {row.url.trim() && (
                  <Input
                    className="h-9 text-sm"
                    maxLength={60}
                    placeholder={site ? `Name (optional) — ${site}` : 'Name (optional)'}
                    value={row.label}
                    onChange={(e) => update(row.key, { label: e.target.value })}
                    aria-label={`Link ${i + 1} name`}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {/* The server keeps up to twenty; past that the button would only lead to a refusal. */}
      <Button type="button" variant="ghost" size="sm" className="mt-1" disabled={value.length >= MAX_LINKS} onClick={add}>
        <PlusIcon className="h-4 w-4" />
        Add link
      </Button>
    </div>
  );
}
